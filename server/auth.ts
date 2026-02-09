import session from "express-session";
import type { Express, RequestHandler } from "express";
import connectPg from "connect-pg-simple";

export function getSession() {
  const sessionTtl = 90 * 24 * 60 * 60 * 1000; // 90 days (3 months)
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: true,
    ttl: sessionTtl,
    tableName: "sessions",
  });
  
  console.log(`[SESSION] Cookie configuration: name=jc.sid, secure=auto, sameSite=lax, environment=${process.env.NODE_ENV}`);
  
  return session({
    name: 'jc.sid',
    secret: process.env.SESSION_SECRET!,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    proxy: true,
    cookie: {
      httpOnly: true,
      secure: 'auto' as any,
      sameSite: 'lax',
      maxAge: sessionTtl,
      path: '/',
    },
  });
}

export function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());
  
  console.log('✅ Session management setup completed');
}

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  const hasCookie = !!(req.cookies?.['jc.sid'] || req.headers.cookie?.includes('jc.sid'));
  console.log('[AUTH CHECK] Path:', req.path, '| Session ID:', req.sessionID?.slice(0, 8) || 'none', '| Has cookie:', hasCookie);
  
  const sessionUserId = (req.session as any).userId;
  
  if (!sessionUserId) {
    console.log('[AUTH CHECK] ❌ No session user ID found');
    return res.status(401).json({ message: "Unauthorized" });
  }
  
  // User authenticated via email/password - check status
  try {
    const { db } = await import('./db');
    const { users } = await import('@shared/schema');
    const { eq } = await import('drizzle-orm');
    
    const [dbUser] = await db
      .select()
      .from(users)
      .where(eq(users.id, sessionUserId))
      .limit(1);

    if (!dbUser) {
      console.log('[AUTH CHECK] ❌ Session user not found in database');
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (dbUser.status === 'pending') {
      console.log('[AUTH CHECK] ❌ User status is pending');
      return res.status(403).json({ 
        message: "Account pending approval", 
        status: "pending" 
      });
    }

    // Accept both 'approved' and 'active' as valid statuses
    const validStatuses = ['approved', 'active'];
    if (!validStatuses.includes(dbUser.status || '')) {
      console.log('[AUTH CHECK] ❌ User status is not valid:', dbUser.status);
      return res.status(403).json({ 
        message: "Account access restricted", 
        status: dbUser.status 
      });
    }

    // Attach user to request for use in route handlers
    (req as any).user = dbUser;
    
    console.log('[AUTH CHECK] ✅ User authenticated and approved:', dbUser.role);
    return next();
  } catch (error) {
    console.error('[AUTH CHECK] Database error:', error);
    return res.status(500).json({ message: "Authentication check failed" });
  }
};
