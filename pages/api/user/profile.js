import { PrismaClient } from '@prisma/client';
import { getToken } from 'next-auth/jwt';

const prisma = new PrismaClient();

export default async function handler(req, res) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  
  if (!token) {
    return res.status(401).json({ message: 'Unauthorized' });
  }
  
  if (req.method === 'GET') {
    try {
      // Get user with selected fields and relationships
      const user = await prisma.user.findUnique({
        where: { id: token.id },
        select: {
          id: true,
          email: true,
          first_name: true,
          last_name: true,
          profile_image: true,
          phone_number: true,
          balance: true,
          email_verified: true,
          created_at: true,
          user_roles: true,
          admin: token.roles.includes('admin'),
          issuer: token.roles.includes('issuer'),
          investor: token.roles.includes('investor'),
          user_tokens: {
            include: {
              token: {
                select: {
                  id: true,
                  name: true,
                  symbol: true,
                  asset_type: true,
                  image_url: true,
                  price_per_token: true,
                }
              }
            }
          },
        }
      });
      
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }
      
      // Prepare user roles for response
      const roles = user.user_roles.map(roleObj => roleObj.role);
      
      // Fetch KYC status if available
      let kycStatus = null;
      
      if (roles.includes('investor') || roles.includes('issuer')) {
        const kycRecord = await prisma.kycVerification.findUnique({
          where: { user_id: token.id },
          select: {
            status: true,
            verification_date: true,
          }
        });
        
        kycStatus = kycRecord ? kycRecord.status : 'not_started';
      }
      
      // Clean up response object
      const responseData = {
        ...user,
        roles,
        kyc_status: kycStatus,
        // Remove the raw user_roles array from response
        user_roles: undefined
      };
      
      res.status(200).json(responseData);
    } catch (error) {
      console.error('Error fetching user profile:', error);
      res.status(500).json({ message: 'Failed to fetch user profile', error: error.message });
    }
  } else if (req.method === 'PUT') {
    try {
      const { first_name, last_name, phone_number, profile_image } = req.body;
      
      // Create update object with provided fields
      const updateData = {};
      if (first_name !== undefined) updateData.first_name = first_name;
      if (last_name !== undefined) updateData.last_name = last_name;
      if (phone_number !== undefined) updateData.phone_number = phone_number;
      if (profile_image !== undefined) updateData.profile_image = profile_image;
      
      // Update user profile
      const updatedUser = await prisma.user.update({
        where: { id: token.id },
        data: updateData,
        select: {
          id: true,
          email: true,
          first_name: true,
          last_name: true,
          profile_image: true,
          phone_number: true,
        }
      });
      
      res.status(200).json(updatedUser);
    } catch (error) {
      console.error('Error updating user profile:', error);
      res.status(500).json({ message: 'Failed to update user profile', error: error.message });
    }
  } else {
    res.setHeader('Allow', ['GET', 'PUT']);
    res.status(405).json({ message: `Method ${req.method} not allowed` });
  }
}
