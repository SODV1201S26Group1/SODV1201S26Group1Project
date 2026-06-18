const jwt = require('jsonwebtoken');

function authenticateToken(req, res, next) {
    const authorizationHeader =
        req.headers.authorization;

    if (
        !authorizationHeader ||
        !authorizationHeader.startsWith('Bearer ')
    ) {
        return res.status(401).json({
            success: false,
            message: 'Authentication token is required.'
        });
    }

    const token =
        authorizationHeader.split(' ')[1];

    try {
        const decodedUser = jwt.verify(
            token,
            process.env.JWT_SECRET
        );

        req.user = decodedUser;
        next();
    } catch (error) {
        return res.status(401).json({
            success: false,
            message: 'Invalid or expired token.'
        });
    }
}

function requireOwner(req, res, next) {
    if (req.user.role !== 'owner') {
        return res.status(403).json({
            success: false,
            message: 'Owner access is required.'
        });
    }

    next();
}

module.exports = {
    authenticateToken,
    requireOwner
};