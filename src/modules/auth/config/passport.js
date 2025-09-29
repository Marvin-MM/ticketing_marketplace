import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import prisma from '../../../config/database.js';
import config from '../../../config/index.js';
import logger from '../../../config/logger.js';

// Configure Google OAuth Strategy
passport.use(
  new GoogleStrategy(
    {
      clientID: config.auth.google.clientId,
      clientSecret: config.auth.google.clientSecret,
      callbackURL: config.auth.google.callbackUrl,
      scope: ['profile', 'email'],
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const { id: googleId, emails, name, photos } = profile;
        const email = emails?.[0]?.value;
        
        if (!email) {
          return done(new Error('No email found from Google account'), null);
        }

        // Check if user exists
        let user = await prisma.user.findUnique({
          where: { googleId },
        });

        if (user) {
          // Update last login
          user = await prisma.user.update({
            where: { id: user.id },
            data: {
              lastLoginAt: new Date(),
              profilePicture: photos?.[0]?.value || user.profilePicture,
            },
          });
          
          logger.info('User logged in via Google OAuth', { userId: user.id, email: user.email });
        } else {
          // Check if email already exists (user might have signed up before)
          const existingUser = await prisma.user.findUnique({
            where: { email },
          });

          if (existingUser) {
            // Link Google account to existing user
            user = await prisma.user.update({
              where: { id: existingUser.id },
              data: {
                googleId,
                lastLoginAt: new Date(),
                profilePicture: photos?.[0]?.value || existingUser.profilePicture,
              },
            });
            
            logger.info('Google account linked to existing user', { userId: user.id, email: user.email });
          } else {
            // Create new user
            const isSuperAdmin = config.auth.superAdminEmails.includes(email);
            
            user = await prisma.user.create({
              data: {
                googleId,
                email,
                firstName: name?.givenName || '',
                lastName: name?.familyName || '',
                profilePicture: photos?.[0]?.value || null,
                role: isSuperAdmin ? 'SUPER_ADMIN' : 'CUSTOMER',
                lastLoginAt: new Date(),
              },
            });
            
            logger.info('New user created via Google OAuth', { 
              userId: user.id, 
              email: user.email,
              role: user.role 
            });

            // Log audit event
            await prisma.auditLog.create({
              data: {
                userId: user.id,
                action: 'USER_REGISTRATION',
                entity: 'User',
                entityId: user.id,
                metadata: {
                  method: 'google_oauth',
                  role: user.role,
                },
              },
            });
          }
        }

        return done(null, user);
      } catch (error) {
        logger.error('Google OAuth error:', error);
        return done(error, null);
      }
    }
  )
);

// Serialize user for session
passport.serializeUser((user, done) => {
  done(null, user.id);
});

// Deserialize user from session
passport.deserializeUser(async (id, done) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        profilePicture: true,
        isActive: true,
        applicationStatus: true,
      },
    });
    
    if (!user || !user.isActive) {
      return done(null, false);
    }
    
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

export default passport;