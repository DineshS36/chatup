const jwt = require('jsonwebtoken');

const auth = (req, res, next) => {
  try {
    let token;

    // Check for token in Authorization header
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    // Check if token exists
    if (!token) {
      const error = new Error('Not authorized, no token');
      error.status = 401;
      throw error;
    }

    // Debug logs (remove after fixing)
    console.log('--- AUTH DEBUG ---');
    console.log('Token received:', token.substring(0, 20) + '...');
    console.log('JWT_SECRET loaded:', !!process.env.JWT_SECRET);
    console.log('JWT_SECRET value:', process.env.JWT_SECRET);

    try {
      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      console.log('Decoded payload:', decoded);
      console.log('--- END DEBUG ---');
      req.userId = decoded.userId;
      next();
    } catch (err) {
      console.error('JWT verify error:', err.message);
      console.log('--- END DEBUG ---');
      const error = new Error('Not authorized, token failed');
      error.status = 401;
      throw error;
    }
  } catch (error) {
    next(error);
  }
};

module.exports = auth;