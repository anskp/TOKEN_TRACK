import { PrismaClient } from '@prisma/client';
import { getToken } from 'next-auth/jwt';

const prisma = new PrismaClient();

export default async function handler(req, res) {
  // Get token to check authentication
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  
  if (!token) {
    return res.status(401).json({ message: 'Unauthorized' });
  }
  
  if (req.method === 'GET') {
    try {
      // Extract query parameters
      const { 
        tokenId, 
        orderType, 
        status,
        userId,
        page = 1,
        limit = 20
      } = req.query;
      
      // Build filter object
      const filter = {};
      if (tokenId) filter.token_id = parseInt(tokenId);
      if (orderType) filter.order_type = orderType;
      if (status) filter.status = status;
      
      // If userId is specified, filter by that user, otherwise get all orders
      // For security, non-admins can only see their own orders
      if (userId) {
        filter.user_id = parseInt(userId);
      } else if (!token.roles.includes('admin')) {
        // If not admin and not filtering by userId, only show own orders
        filter.user_id = token.id;
      }
      
      // Calculate pagination values
      const skip = (parseInt(page) - 1) * parseInt(limit);
      
      // Get orders with related data
      const orders = await prisma.marketOrder.findMany({
        where: filter,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              first_name: true,
              last_name: true,
            }
          },
          token: {
            select: {
              id: true,
              name: true,
              symbol: true,
              asset_type: true,
              image_url: true,
            }
          },
          transactions: {
            select: {
              id: true,
              quantity: true,
              price: true,
              timestamp: true,
              status: true,
            }
          }
        },
        skip,
        take: parseInt(limit),
        orderBy: { created_at: 'desc' }
      });
      
      // Count total orders matching filters
      const totalOrders = await prisma.marketOrder.count({ where: filter });
      
      res.status(200).json({
        orders,
        pagination: {
          total: totalOrders,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(totalOrders / parseInt(limit))
        }
      });
    } catch (error) {
      console.error('Error fetching market orders:', error);
      res.status(500).json({ message: 'Failed to fetch market orders', error: error.message });
    }
  } else if (req.method === 'POST') {
    try {
      const { tokenId, orderType, quantity, price } = req.body;
      
      if (!tokenId || !orderType || !quantity || !price) {
        return res.status(400).json({ message: 'Missing required fields' });
      }
      
      // Validate input data
      if (!['buy', 'sell'].includes(orderType)) {
        return res.status(400).json({ message: 'Order type must be either buy or sell' });
      }
      
      // Get the token
      const token = await prisma.token.findUnique({
        where: { id: parseInt(tokenId) }
      });
      
      if (!token) {
        return res.status(404).json({ message: 'Token not found' });
      }
      
      // Check if token is live
      if (token.status !== 'live') {
        return res.status(400).json({ message: 'Token is not available for trading' });
      }
      
      // If selling, check if user has enough tokens
      if (orderType === 'sell') {
        const userToken = await prisma.userToken.findUnique({
          where: {
            user_id_token_id: {
              user_id: token.id,
              token_id: parseInt(tokenId)
            }
          }
        });
        
        if (!userToken || parseFloat(userToken.balance) - parseFloat(userToken.locked_balance) < parseFloat(quantity)) {
          return res.status(400).json({ message: 'Insufficient token balance' });
        }
        
        // Lock the tokens being sold
        await prisma.userToken.update({
          where: {
            user_id_token_id: {
              user_id: token.id,
              token_id: parseInt(tokenId)
            }
          },
          data: {
            locked_balance: {
              increment: parseFloat(quantity)
            }
          }
        });
      } else {
        // If buying, check if user has enough balance
        const user = await prisma.user.findUnique({
          where: { id: token.id }
        });
        
        const requiredBalance = parseFloat(quantity) * parseFloat(price);
        
        if (parseFloat(user.balance) < requiredBalance) {
          return res.status(400).json({ message: 'Insufficient account balance' });
        }
        
        // Lock the funds for the purchase
        await prisma.user.update({
          where: { id: token.id },
          data: {
            balance: {
              decrement: requiredBalance
            }
          }
        });
      }
      
      // Create the market order
      const newOrder = await prisma.marketOrder.create({
        data: {
          user_id: token.id,
          token_id: parseInt(tokenId),
          order_type: orderType,
          quantity: parseFloat(quantity),
          remaining_quantity: parseFloat(quantity),
          price: parseFloat(price),
          status: 'open',
        }
      });
      
      // Try to match the order with existing orders
      await matchOrder(newOrder);
      
      // Get the updated order to return
      const updatedOrder = await prisma.marketOrder.findUnique({
        where: { id: newOrder.id },
        include: {
          transactions: true
        }
      });
      
      res.status(201).json(updatedOrder);
    } catch (error) {
      console.error('Error creating market order:', error);
      res.status(500).json({ message: 'Failed to create market order', error: error.message });
    }
  } else {
    res.setHeader('Allow', ['GET', 'POST']);
    res.status(405).json({ message: `Method ${req.method} not allowed` });
  }
}

// Function to match the new order with existing orders
async function matchOrder(newOrder) {
  const { id: orderId, token_id: tokenId, order_type: orderType, price, remaining_quantity } = newOrder;
  
  // Find matching orders in the opposite direction
  const matchCondition = {
    token_id: tokenId,
    order_type: orderType === 'buy' ? 'sell' : 'buy',
    status: { in: ['open', 'partially_filled'] },
  };
  
  // For buy orders, we want price >= match price
  // For sell orders, we want price <= match price
  if (orderType === 'buy') {
    matchCondition.price = { lte: price };
  } else {
    matchCondition.price = { gte: price };
  }
  
  // Get matching orders, sorted by price and time
  const matchingOrders = await prisma.marketOrder.findMany({
    where: matchCondition,
    orderBy: [
      { price: orderType === 'buy' ? 'asc' : 'desc' }, // Best price first
      { created_at: 'asc' } // Oldest first
    ]
  });
  
  // No matching orders
  if (matchingOrders.length === 0) return;
  
  // Track remaining quantity to match
  let remainingQty = parseFloat(remaining_quantity);
  
  // Process matching orders
  for (const matchOrder of matchingOrders) {
    if (remainingQty <= 0) break;
    
    const matchQty = Math.min(remainingQty, parseFloat(matchOrder.remaining_quantity));
    const matchPrice = parseFloat(matchOrder.price);
    
    // Create a transaction record
    const buyerId = orderType === 'buy' ? newOrder.user_id : matchOrder.user_id;
    const sellerId = orderType === 'buy' ? matchOrder.user_id : newOrder.user_id;
    
    await prisma.marketTransaction.create({
      data: {
        order_id: orderType === 'buy' ? orderId : matchOrder.id,
        token_id: tokenId,
        buyer_id: buyerId,
        seller_id: sellerId,
        quantity: matchQty,
        price: matchPrice,
        fee: matchQty * matchPrice * 0.002, // 0.2% fee
        status: 'completed',
      }
    });
    
    // Update matching order
    const newMatchRemainingQty = parseFloat(matchOrder.remaining_quantity) - matchQty;
    const matchStatus = newMatchRemainingQty > 0 ? 'partially_filled' : 'filled';
    
    await prisma.marketOrder.update({
      where: { id: matchOrder.id },
      data: {
        remaining_quantity: newMatchRemainingQty,
        status: matchStatus
      }
    });
    
    // Update buyer and seller token balances
    await updateTokenBalances(tokenId, buyerId, sellerId, matchQty);
    
    // Update remaining quantity
    remainingQty -= matchQty;
  }
  
  // Update the new order status
  const newStatus = remainingQty > 0 ? 
    (remainingQty < parseFloat(remaining_quantity) ? 'partially_filled' : 'open') : 
    'filled';
  
  await prisma.marketOrder.update({
    where: { id: orderId },
    data: {
      remaining_quantity: remainingQty,
      status: newStatus
    }
  });
}

// Function to update token balances after a match
async function updateTokenBalances(tokenId, buyerId, sellerId, quantity) {
  // Update buyer's token balance
  const buyerToken = await prisma.userToken.findUnique({
    where: {
      user_id_token_id: {
        user_id: buyerId,
        token_id: tokenId
      }
    }
  });
  
  if (buyerToken) {
    // Increment existing balance
    await prisma.userToken.update({
      where: {
        user_id_token_id: {
          user_id: buyerId,
          token_id: tokenId
        }
      },
      data: {
        balance: {
          increment: quantity
        }
      }
    });
  } else {
    // Create new balance record
    await prisma.userToken.create({
      data: {
        user_id: buyerId,
        token_id: tokenId,
        balance: quantity
      }
    });
  }
  
  // Update seller's token balance and unlock tokens
  await prisma.userToken.update({
    where: {
      user_id_token_id: {
        user_id: sellerId,
        token_id: tokenId
      }
    },
    data: {
      balance: {
        decrement: quantity
      },
      locked_balance: {
        decrement: quantity
      }
    }
  });
}
