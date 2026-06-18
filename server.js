/*
AI declaration:
GitHub Copilot was used to help draft code, explain parts of the assignment by drawing parallels to PLC programming and robotics principles, and help fix errors and refine the code. GitHub Copilot was also used to guide API testing workflows in Postman and support UI testing checks in VS Code.
Technical background: PLC programming and robotics systems.
*/

// ─── Environment and Dependencies ──────────────────────────────────────────
require('dotenv').config();

const express = require('express');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const { initializeDatabase, getDatabaseStatus } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── In-Memory Data Store ───────────────────────────────────────────────────
const users = [];
const properties = [];
const contactMessages = [];

const normalizeEmail = value =>
    String(value || '').trim().toLowerCase();

const allowedRoles = new Set([
    'owner',
    'coworker'
]);

const passwordPattern =
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d\s]).{8,}$/;

const loginAttempts = new Map();

const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_LOCKOUT_MS = 15 * 60 * 1000;

let nextPropertyId = 1;

const isValidPassword = value =>
    passwordPattern.test(String(value || ''));

// ─── Test Helper ────────────────────────────────────────────────────────────
function resetState() {
    users.length = 0;
    properties.length = 0;
    contactMessages.length = 0;
    loginAttempts.clear();
    nextPropertyId = 1;
}

// ─── Middleware ─────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ─── Database Health Check ─────────────────────────────────────────────────
app.get('/health', async (req, res) => {
    try {
        const status = await getDatabaseStatus();

        res.json({
            success: true,
            message: 'Server and database are connected.',
            databaseTime: status.databaseTime,
            tables: status.tables
        });
    } catch (error) {
        console.error(
            'Health check failed:',
            error
        );

        res.status(500).json({
            success: false,
            message: 'Database connection failed.'
        });
    }
});

// ─── Authentication Routes ─────────────────────────────────────────────────
app.post('/register', async (req, res) => {
    const {
        name,
        phone,
        email,
        password,
        role
    } = req.body;

    const normalizedEmail =
        normalizeEmail(email);

    const normalizedRole =
        String(role || '')
            .trim()
            .toLowerCase();

    if (!isValidPassword(password)) {
        return res.json({
            success: false,
            message:
                'Password must be at least 8 characters and include uppercase, lowercase, number, and special character.'
        });
    }

    if (!allowedRoles.has(normalizedRole)) {
        return res.json({
            success: false,
            message: 'Invalid role selected'
        });
    }

    const exists = users.find(
        user =>
            normalizeEmail(user.email) ===
            normalizedEmail
    );

    if (exists) {
        return res.json({
            success: false,
            message: 'Email already registered'
        });
    }

    const hashedPassword =
        await bcrypt.hash(password, 10);

    users.push({
        name,
        phone,
        email: normalizedEmail,
        password: hashedPassword,
        role: normalizedRole
    });

    res.json({
        success: true,
        message: 'User registered!'
    });
});

app.post('/login', async (req, res) => {
    const {
        email,
        password
    } = req.body;

    const normalizedEmail =
        normalizeEmail(email);

    const now = Date.now();

    const attemptRecord =
        loginAttempts.get(normalizedEmail);

    if (!normalizedEmail || !password) {
        return res.status(400).json({
            success: false,
            message:
                'Email and password are required'
        });
    }

    if (
        attemptRecord &&
        attemptRecord.lockUntil &&
        attemptRecord.lockUntil > now
    ) {
        return res.status(429).json({
            success: false,
            message:
                'Too many failed login attempts. Please try again later.'
        });
    }

    if (
        attemptRecord &&
        attemptRecord.lockUntil &&
        attemptRecord.lockUntil <= now
    ) {
        loginAttempts.delete(
            normalizedEmail
        );
    }

    const user = users.find(
        currentUser =>
            normalizeEmail(
                currentUser.email
            ) === normalizedEmail
    );

    if (!user) {
        const nextCount =
            (attemptRecord?.count || 0) + 1;

        loginAttempts.set(
            normalizedEmail,
            {
                count: nextCount,
                lockUntil:
                    nextCount >=
                    MAX_LOGIN_ATTEMPTS
                        ? now +
                          LOGIN_LOCKOUT_MS
                        : null
            }
        );

        return res.status(401).json({
            success: false,
            message: 'Invalid credentials'
        });
    }

    const passwordMatches =
        await bcrypt.compare(
            password,
            user.password
        );

    if (passwordMatches) {
        loginAttempts.delete(
            normalizedEmail
        );

        return res.json({
            success: true,
            role: user.role,
            name: user.name
        });
    }

    const nextCount =
        (attemptRecord?.count || 0) + 1;

    loginAttempts.set(
        normalizedEmail,
        {
            count: nextCount,
            lockUntil:
                nextCount >=
                MAX_LOGIN_ATTEMPTS
                    ? now +
                      LOGIN_LOCKOUT_MS
                    : null
        }
    );

    return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
    });
});

// ─── Property Routes ───────────────────────────────────────────────────────
app.post('/properties', (req, res) => {
    const {
        email,
        address,
        neighborhood,
        squareFootage,
        garage,
        publicTransport
    } = req.body;

    const normalizedEmail =
        normalizeEmail(email);

    const normalizedAddress =
        String(address || '').trim();

    const normalizedNeighborhood =
        String(neighborhood || '').trim();

    const parsedSquareFootage =
        Number(squareFootage);

    if (
        !normalizedEmail ||
        !normalizedAddress ||
        !normalizedNeighborhood ||
        !Number.isInteger(
            parsedSquareFootage
        ) ||
        parsedSquareFootage < 1 ||
        !garage ||
        !publicTransport
    ) {
        return res.json({
            success: false,
            message:
                'All property fields are required.'
        });
    }

    properties.push({
        propertyId: nextPropertyId++,
        ownerId: normalizedEmail,
        email: normalizedEmail,
        address: normalizedAddress,
        neighborhood:
            normalizedNeighborhood,
        squareFootage:
            parsedSquareFootage,
        garage,
        publicTransport,
        workspaces: []
    });

    res.json({
        success: true,
        message: 'Property added!'
    });
});

app.get('/properties', (req, res) => {
    const email =
        normalizeEmail(req.query.email);

    const userProperties = properties
        .map(
            (
                property,
                propertyIndex
            ) => ({
                ...property,
                propertyIndex
            })
        )
        .filter(
            property =>
                normalizeEmail(
                    property.email
                ) === email
        );

    res.json({
        success: true,
        properties: userProperties
    });
});

app.delete(
    '/properties/:index',
    (req, res) => {
        const email =
            normalizeEmail(req.body.email);

        const index =
            parseInt(
                req.params.index,
                10
            );

        if (!Number.isInteger(index)) {
            return res.status(400).json({
                success: false,
                message:
                    'Invalid property index.'
            });
        }

        const property =
            properties[index];

        if (
            index >= 0 &&
            property &&
            normalizeEmail(
                property.email
            ) === email
        ) {
            properties.splice(index, 1);

            return res.json({
                success: true
            });
        }

        return res.json({
            success: false,
            message: 'Property not found'
        });
    }
);

// ─── Workspace Routes ──────────────────────────────────────────────────────
app.post('/workspaces', (req, res) => {
    const {
        email,
        propertyIndex,
        type,
        capacity,
        smoking,
        availability,
        leaseTerm,
        price
    } = req.body;

    const normalizedEmail =
        normalizeEmail(email);

    const parsedPropertyIndex =
        Number(propertyIndex);

    if (
        !Number.isInteger(
            parsedPropertyIndex
        ) ||
        parsedPropertyIndex < 0 ||
        parsedPropertyIndex >=
            properties.length
    ) {
        return res.json({
            success: false,
            message: 'Property not found'
        });
    }

    const property =
        properties[
            parsedPropertyIndex
        ];

    if (
        !property ||
        normalizeEmail(
            property.email
        ) !== normalizedEmail
    ) {
        return res.json({
            success: false,
            message:
                'Property not found for this owner.'
        });
    }

    if (
        type &&
        capacity &&
        smoking &&
        availability &&
        leaseTerm &&
        price
    ) {
        property.workspaces.push({
            type,
            capacity,
            smoking,
            availability,
            leaseTerm,
            price,
            ownerEmail:
                normalizedEmail
        });

        return res.json({
            success: true,
            message:
                'Workspace added!'
        });
    }

    return res.json({
        success: false,
        message:
            'Please fill in all required workspace fields.'
    });
});

app.put(
    '/workspaces/:propertyIndex/:workspaceIndex',
    (req, res) => {
        const {
            email,
            type,
            capacity,
            smoking,
            availability,
            leaseTerm,
            price
        } = req.body;

        const normalizedEmail =
            normalizeEmail(email);

        const propertyIndex =
            Number(
                req.params.propertyIndex
            );

        const workspaceIndex =
            Number(
                req.params.workspaceIndex
            );

        if (
            !Number.isInteger(
                propertyIndex
            ) ||
            !Number.isInteger(
                workspaceIndex
            ) ||
            propertyIndex < 0 ||
            workspaceIndex < 0
        ) {
            return res.json({
                success: false,
                message:
                    'Invalid workspace selection.'
            });
        }

        const property =
            properties[propertyIndex];

        if (
            !property ||
            normalizeEmail(
                property.email
            ) !== normalizedEmail
        ) {
            return res.json({
                success: false,
                message:
                    'Property not found for this owner.'
            });
        }

        const normalizedType =
            String(type || '').trim();

        const normalizedSmoking =
            String(smoking || '').trim();

        const normalizedAvailability =
            String(
                availability || ''
            ).trim();

        const normalizedLeaseTerm =
            String(
                leaseTerm || ''
            ).trim();

        const parsedCapacity =
            Number(capacity);

        const parsedPrice =
            Number(price);

        if (
            !normalizedType ||
            !Number.isFinite(
                parsedCapacity
            ) ||
            parsedCapacity < 1 ||
            !normalizedSmoking ||
            !normalizedAvailability ||
            !normalizedLeaseTerm ||
            !Number.isFinite(
                parsedPrice
            ) ||
            parsedPrice <= 0
        ) {
            return res.json({
                success: false,
                message:
                    'All workspace fields are required.'
            });
        }

        if (
            !property.workspaces ||
            workspaceIndex >=
                property.workspaces.length
        ) {
            return res.json({
                success: false,
                message:
                    'Workspace not found.'
            });
        }

        property.workspaces[
            workspaceIndex
        ] = {
            ...property.workspaces[
                workspaceIndex
            ],
            type: normalizedType,
            capacity: parsedCapacity,
            smoking:
                normalizedSmoking,
            availability:
                normalizedAvailability,
            leaseTerm:
                normalizedLeaseTerm,
            price: parsedPrice,
            ownerEmail:
                normalizedEmail
        };

        res.json({
            success: true,
            message:
                'Workspace updated!'
        });
    }
);

app.delete(
    '/workspaces/:propertyIndex/:workspaceIndex',
    (req, res) => {
        const email =
            normalizeEmail(req.body.email);

        const propertyIndex =
            Number(
                req.params.propertyIndex
            );

        const workspaceIndex =
            Number(
                req.params.workspaceIndex
            );

        if (
            !Number.isInteger(
                propertyIndex
            ) ||
            !Number.isInteger(
                workspaceIndex
            ) ||
            propertyIndex < 0 ||
            workspaceIndex < 0
        ) {
            return res.json({
                success: false,
                message:
                    'Invalid workspace selection.'
            });
        }

        const property =
            properties[propertyIndex];

        if (
            !property ||
            normalizeEmail(
                property.email
            ) !== email
        ) {
            return res.json({
                success: false,
                message:
                    'Property not found for this owner.'
            });
        }

        if (
            !property.workspaces ||
            workspaceIndex >=
                property.workspaces.length
        ) {
            return res.json({
                success: false,
                message:
                    'Workspace not found.'
            });
        }

        property.workspaces.splice(
            workspaceIndex,
            1
        );

        res.json({
            success: true,
            message:
                'Workspace deleted!'
        });
    }
);

app.get('/workspaces', (req, res) => {
    const allWorkspaces = [];

    properties.forEach(
        (property, propertyIndex) => {
            property.workspaces.forEach(
                (
                    workspace,
                    workspaceIndex
                ) => {
                    allWorkspaces.push({
                        ...workspace,
                        propertyIndex,
                        workspaceIndex,
                        address:
                            property.address,
                        neighborhood:
                            property.neighborhood,
                        ownerEmail:
                            property.email
                    });
                }
            );
        }
    );

    res.json({
        success: true,
        workspaces: allWorkspaces
    });
});

// ─── Contact Message Routes ────────────────────────────────────────────────
app.post('/messages', (req, res) => {
    const {
        fromEmail,
        toEmail,
        senderName,
        senderEmail,
        message,
        propertyIndex,
        workspaceIndex,
        workspaceType
    } = req.body;

    const normalizedToEmail =
        String(toEmail || '').trim();

    const normalizedSenderName =
        String(senderName || '').trim();

    const normalizedSenderEmail =
        String(senderEmail || '').trim();

    const normalizedMessage =
        String(message || '').trim();

    if (
        !normalizedToEmail ||
        !normalizedSenderName ||
        !normalizedSenderEmail ||
        !normalizedMessage
    ) {
        return res.json({
            success: false,
            message:
                'All contact fields are required.'
        });
    }

    contactMessages.push({
        fromEmail:
            String(fromEmail || '').trim(),
        toEmail: normalizedToEmail,
        senderName:
            normalizedSenderName,
        senderEmail:
            normalizedSenderEmail,
        message: normalizedMessage,
        propertyIndex,
        workspaceIndex,
        workspaceType:
            String(
                workspaceType || ''
            ).trim(),
        createdAt:
            new Date().toISOString()
    });

    return res.json({
        success: true,
        message:
            'Message sent to owner.'
    });
});

// ─── Server Start ──────────────────────────────────────────────────────────
async function startServer() {
    try {
        await initializeDatabase();

        app.listen(PORT, () => {
            console.log(
                `Server running on port ${PORT}`
            );
        });
    } catch (error) {
        console.error(
            'The server could not start because the database setup failed:',
            error
        );

        process.exit(1);
    }
}

if (require.main === module) {
    startServer();
}

module.exports = {
    app,
    resetState
};