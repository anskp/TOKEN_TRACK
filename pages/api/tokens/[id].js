import { PrismaClient } from '@prisma/client';
import { getToken } from 'next-auth/jwt';

const prisma = new PrismaClient();

export default async function handler(req, res) {
  const { id } = req.query;
  const tokenId = parseInt(id);
  
  // Get token to check authentication
  const authToken = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  
  if (req.method === 'GET') {
    try {
      const token = await prisma.token.findUnique({
        where: { id: tokenId },
        include: {
          issuer: {
            select: {
              company_name: true,
              jurisdiction: true,
              verification_status: true,
              user: {
                select: {
                  id: true,
                  email: true,
                  first_name: true,
                  last_name: true,
                }
              }
            }
          },
          investments: {
            select: {
              id: true,
              amount: true,
              price_per_token: true,
              investment_date: true,
              status: true,
            }
          },
          // Include market stats
          market_orders: {
            where: { status: { in: ['open', 'partially_filled'] } },
            select: {
              id: true,
              order_type: true,
              quantity: true,
              remaining_quantity: true,
              price: true,
              created_at: true,
            }
          },
        }
      });
      
      if (!token) {
        return res.status(404).json({ message: 'Token not found' });
      }
      
      // Calculate market stats
      const marketStats = {
        currentPrice: token.price_per_token, // Default to initial price
        highestBid: 0,
        lowestAsk: 0,
        volume24h: 0,
      };
      
      // Find highest bid and lowest ask
      const buyOrders = token.market_orders.filter(o => o.order_type === 'buy');
      const sellOrders = token.market_orders.filter(o => o.order_type === 'sell');
      
      if (buyOrders.length > 0) {
        marketStats.highestBid = Math.max(...buyOrders.map(o => parseFloat(o.price)));
      }
      
      if (sellOrders.length > 0) {
        marketStats.lowestAsk = Math.min(...sellOrders.map(o => parseFloat(o.price)));
      }
      
      // Calculate 24h volume
      const oneDayAgo = new Date();
      oneDayAgo.setDate(oneDayAgo.getDate() - 1);
      
      const recentTransactions = await prisma.marketTransaction.findMany({
        where: {
          token_id: tokenId,
          status: 'completed',
          timestamp: { gte: oneDayAgo }
        }
      });
      
      marketStats.volume24h = recentTransactions.reduce(
        (sum, tx) => sum + parseFloat(tx.quantity) * parseFloat(tx.price),
        0
      );
      
      // If there are completed transactions, use the most recent as current price
      if (recentTransactions.length > 0) {
        const latestTx = recentTransactions.sort(
          (a, b) => b.timestamp.getTime() - a.timestamp.getTime()
        )[0];
        marketStats.currentPrice = parseFloat(latestTx.price);
      }
      
      // Add market stats to the response
      const responseData = {
        ...token,
        marketStats,
      };
      
      res.status(200).json(responseData);
    } catch (error) {
      console.error('Error fetching token details:', error);
      res.status(500).json({ message: 'Failed to fetch token details', error: error.message });
    }
  } else if (req.method === 'PUT') {
    // Only token issuer or admin can update token
    if (!authToken) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    
    try {
      // Get the token with issuer info
      const existingToken = await prisma.token.findUnique({
        where: { id: tokenId },
        include: {
          issuer: true,
        }
      });
      
      if (!existingToken) {
        return res.status(404).json({ message: 'Token not found' });
      }
      
      // Check if user is authorized to update this token
      const isAdmin = authToken.roles.includes('admin');
      const isIssuer = existingToken.issuer.user_id === authToken.id;
      
      if (!isAdmin && !isIssuer) {
        return res.status(403).json({ message: 'Forbidden: You do not have permission to update this token' });
      }
      
      // Extract update data, handling JSON fields
      const {
        name,
        symbol,
        description,
        asset_type,
        token_standard,
        price_per_token,
        image_url,
        legal_documents,
        status,
        metadata_uri,
        contract_address,
      } = req.body;
      
      // Create update data object with only provided fields
      const updateData = {};
      if (name !== undefined) updateData.name = name;
      if (symbol !== undefined) updateData.symbol = symbol;
      if (description !== undefined) updateData.description = description;
      if (asset_type !== undefined) updateData.asset_type = asset_type;
      if (token_standard !== undefined) updateData.token_standard = token_standard;
      if (price_per_token !== undefined) updateData.price_per_token = parseFloat(price_per_token);
      if (image_url !== undefined) updateData.image_url = image_url;
      if (legal_documents !== undefined) updateData.legal_documents = legal_documents;
      if (metadata_uri !== undefined) updateData.metadata_uri = metadata_uri;
      if (contract_address !== undefined) updateData.contract_address = contract_address;
      
      // Only admin can update status
      if (status !== undefined && isAdmin) {
        updateData.status = status;
      }
      
      // Update the token
      const updatedToken = await prisma.token.update({
        where: { id: tokenId },
        data: updateData,
      });
      
      res.status(200).json(updatedToken);
    } catch (error) {
      console.error('Error updating token:', error);
      res.status(500).json({ message: 'Failed to update token', error: error.message });
    }
  } else {
    res.setHeader('Allow', ['GET', 'PUT']);
    res.status(405).json({ message: `Method ${req.method} not allowed` });
  }
}
