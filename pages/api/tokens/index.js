import { PrismaClient } from '@prisma/client';
import { getToken } from 'next-auth/jwt';

const prisma = new PrismaClient();

export default async function handler(req, res) {
  // Get token to check authentication
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  
  if (req.method === 'GET') {
    try {
      // Extract query parameters for filtering
      const { 
        assetType, 
        minPrice, 
        maxPrice, 
        status = 'live', // Default to live tokens
        page = 1,
        limit = 10
      } = req.query;
      
      // Build filter object
      const filters = {
        status,
        ...(assetType ? { asset_type: assetType } : {}),
        ...(minPrice ? { price_per_token: { gte: parseFloat(minPrice) } } : {}),
        ...(maxPrice ? { price_per_token: { ...filters.price_per_token, lte: parseFloat(maxPrice) } } : {}),
      };
      
      // Calculate pagination values
      const skip = (parseInt(page) - 1) * parseInt(limit);
      
      // Get tokens with their issuer information
      const tokens = await prisma.token.findMany({
        where: filters,
        include: {
          issuer: {
            select: {
              company_name: true,
              user: {
                select: {
                  id: true,
                  email: true,
                  first_name: true,
                  last_name: true,
                }
              }
            }
          }
        },
        skip,
        take: parseInt(limit),
        orderBy: { creation_date: 'desc' }
      });
      
      // Count total tokens matching filters
      const totalTokens = await prisma.token.count({ where: filters });
      
      res.status(200).json({
        tokens,
        pagination: {
          total: totalTokens,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(totalTokens / parseInt(limit))
        }
      });
    } catch (error) {
      console.error('Error fetching tokens:', error);
      res.status(500).json({ message: 'Failed to fetch tokens', error: error.message });
    }
  } else if (req.method === 'POST') {
    // Only issuer role can create tokens
    if (!token || !token.roles.includes('issuer')) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    
    try {
      const {
        name,
        symbol,
        description,
        asset_type,
        token_standard,
        total_supply,
        price_per_token,
        chain_id,
        image_url,
        legal_documents,
      } = req.body;
      
      // Find the issuer record for the authenticated user
      const issuer = await prisma.issuer.findUnique({
        where: { user_id: token.id }
      });
      
      if (!issuer) {
        return res.status(404).json({ message: 'Issuer profile not found' });
      }
      
      // Create the new token
      const newToken = await prisma.token.create({
        data: {
          issuer_id: issuer.id,
          name,
          symbol,
          description,
          asset_type,
          token_standard,
          total_supply: parseFloat(total_supply),
          price_per_token: parseFloat(price_per_token),
          chain_id: parseInt(chain_id),
          image_url,
          legal_documents,
          status: 'pending', // New tokens are created in pending status for admin approval
        }
      });
      
      res.status(201).json(newToken);
    } catch (error) {
      console.error('Error creating token:', error);
      res.status(500).json({ message: 'Failed to create token', error: error.message });
    }
  } else {
    res.setHeader('Allow', ['GET', 'POST']);
    res.status(405).json({ message: `Method ${req.method} not allowed` });
  }
}
