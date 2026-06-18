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
const jwt = require('jsonwebtoken');

const {
    pool,
    initializeDatabase,
    getDatabaseStatus
} = require('./db');

const {
    authenticateToken,
    requireOwner
} = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
    throw new Error(
        'JWT_SECRET is missing. Add it to the .env file.'
    );
}

// ─── In-Memory Data Store ───────────────────────────────────────────────────
const users = [];
const properties = [];

const normalizeEmail = value =>
    String(value || '').trim().toLowerCase();

function parseBooleanChoice(value) {
    if (
        value === true ||
        String(value).toLowerCase() === 'yes'
    ) {
        return true;
    }

    if (
        value === false ||
        String(value).toLowerCase() === 'no'
    ) {
        return false;
    }

    return null;
}

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
    loginAttempts.clear();
    nextPropertyId = 1;

    pool.query('DELETE FROM contact_messages_v2').catch(() => {
        // Keep resetState non-throwing for existing test flows.
    });
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

    const normalizedName =
        String(name || '').trim();

    const normalizedPhone =
        String(phone || '').trim();

    const normalizedEmail =
        normalizeEmail(email);

    const normalizedRole =
        String(role || '')
            .trim()
            .toLowerCase();

    if (
        !normalizedName ||
        !normalizedEmail ||
        !password ||
        !allowedRoles.has(normalizedRole)
    ) {
        return res.status(400).json({
            success: false,
            message:
                'Name, email, password, and role are required.'
        });
    }

    if (!isValidPassword(password)) {
        return res.status(400).json({
            success: false,
            message:
                'Password must be at least 8 characters and include uppercase, lowercase, number, and special character.'
        });
    }

    try {
        const existingUser = await pool.query(
            `
                SELECT id
                FROM users
                WHERE email = $1
            `,
            [normalizedEmail]
        );

        if (existingUser.rows.length > 0) {
            return res.status(409).json({
                success: false,
                message: 'Email already registered'
            });
        }

        const hashedPassword =
            await bcrypt.hash(password, 10);

        const result = await pool.query(
            `
                INSERT INTO users (
                    full_name,
                    phone,
                    email,
                    password_hash,
                    role
                )
                VALUES ($1, $2, $3, $4, $5)
                RETURNING
                    id,
                    full_name,
                    phone,
                    email,
                    role,
                    created_at
            `,
            [
                normalizedName,
                normalizedPhone,
                normalizedEmail,
                hashedPassword,
                normalizedRole
            ]
        );

        const user = result.rows[0];

        return res.status(201).json({
            success: true,
            message: 'User registered!',
            user: {
                id: user.id,
                name: user.full_name,
                phone: user.phone,
                email: user.email,
                role: user.role,
                createdAt: user.created_at
            }
        });
    } catch (error) {
        console.error(
            'Registration failed:',
            error
        );

        if (error.code === '23505') {
            return res.status(409).json({
                success: false,
                message: 'Email already registered'
            });
        }

        return res.status(500).json({
            success: false,
            message:
                'The user could not be registered.'
        });
    }
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

    try {
        const result = await pool.query(
            `
                SELECT
                    id,
                    full_name,
                    email,
                    password_hash,
                    role
                FROM users
                WHERE email = $1
            `,
            [normalizedEmail]
        );

        const user = result.rows[0];

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
                user.password_hash
            );

        if (!passwordMatches) {
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

        loginAttempts.delete(
            normalizedEmail
        );

        const token = jwt.sign(
            {
                userId: user.id,
                email: user.email,
                role: user.role
            },
            JWT_SECRET,
            {
                expiresIn: '2h'
            }
        );

        return res.json({
            success: true,
            message: 'Login successful',
            token,
            user: {
                id: user.id,
                name: user.full_name,
                email: user.email,
                role: user.role
            },
            role: user.role,
            name: user.full_name
        });
    } catch (error) {
        console.error(
            'Login failed:',
            error
        );

        return res.status(500).json({
            success: false,
            message: 'Login failed.'
        });
    }
});

// ─── Property Routes ───────────────────────────────────────────────────────
app.post(
    '/properties',
    authenticateToken,
    requireOwner,
    async (req, res) => {
        const {
            address,
            neighborhood,
            squareFootage,
            garage,
            publicTransport
        } = req.body;

        const normalizedAddress =
            String(address || '').trim();

        const normalizedNeighborhood =
            String(neighborhood || '').trim();

        const parsedSquareFootage =
            Number(squareFootage);

        const parsedGarage =
            parseBooleanChoice(garage);

        const parsedPublicTransport =
            parseBooleanChoice(publicTransport);

        if (
            !normalizedAddress ||
            !normalizedNeighborhood ||
            !Number.isInteger(parsedSquareFootage) ||
            parsedSquareFootage < 1 ||
            parsedGarage === null ||
            parsedPublicTransport === null
        ) {
            return res.status(400).json({
                success: false,
                message:
                    'All valid property fields are required.'
            });
        }

        try {
            const result = await pool.query(
                `
                    INSERT INTO properties (
                        owner_id,
                        address,
                        neighborhood,
                        square_footage,
                        garage,
                        public_transport
                    )
                    VALUES ($1, $2, $3, $4, $5, $6)
                    RETURNING *
                `,
                [
                    req.user.userId,
                    normalizedAddress,
                    normalizedNeighborhood,
                    parsedSquareFootage,
                    parsedGarage,
                    parsedPublicTransport
                ]
            );

            const property = result.rows[0];

            return res.status(201).json({
                success: true,
                message: 'Property added!',
                property: {
                    id: property.id,
                    propertyId: property.id,
                    propertyIndex: property.id,
                    address: property.address,
                    neighborhood: property.neighborhood,
                    squareFootage:
                        property.square_footage,
                    garage:
                        property.garage
                            ? 'Yes'
                            : 'No',
                    publicTransport:
                        property.public_transport
                            ? 'Yes'
                            : 'No'
                }
            });
        } catch (error) {
            console.error(
                'Property creation failed:',
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    'The property could not be added.'
            });
        }
    }
);

app.get(
    '/properties',
    authenticateToken,
    requireOwner,
    async (req, res) => {
        try {
            const result = await pool.query(
                `
                    SELECT
                        p.*,
                        COUNT(w.id)::INTEGER
                            AS workspace_count
                    FROM properties p
                    LEFT JOIN workspaces w
                        ON w.property_id = p.id
                    WHERE p.owner_id = $1
                    GROUP BY p.id
                    ORDER BY p.id
                `,
                [req.user.userId]
            );

            const userProperties =
                result.rows.map(property => ({
                    id: property.id,
                    propertyId: property.id,
                    propertyIndex: property.id,
                    ownerId: property.owner_id,
                    address: property.address,
                    neighborhood:
                        property.neighborhood,
                    squareFootage:
                        property.square_footage,
                    garage:
                        property.garage
                            ? 'Yes'
                            : 'No',
                    publicTransport:
                        property.public_transport
                            ? 'Yes'
                            : 'No',
                    workspaceCount:
                        property.workspace_count,
                    workspaces: Array(
                        property.workspace_count
                    ).fill(null)
                }));

            return res.json({
                success: true,
                properties: userProperties
            });
        } catch (error) {
            console.error(
                'Property loading failed:',
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    'Properties could not be loaded.'
            });
        }
    }
);

app.put(
    '/properties/:id',
    authenticateToken,
    requireOwner,
    async (req, res) => {
        const propertyId =
            Number(req.params.id);

        const {
            address,
            neighborhood,
            squareFootage,
            garage,
            publicTransport
        } = req.body;

        const normalizedAddress =
            String(address || '').trim();

        const normalizedNeighborhood =
            String(neighborhood || '').trim();

        const parsedSquareFootage =
            Number(squareFootage);

        const parsedGarage =
            parseBooleanChoice(garage);

        const parsedPublicTransport =
            parseBooleanChoice(publicTransport);

        if (
            !Number.isInteger(propertyId) ||
            propertyId < 1
        ) {
            return res.status(400).json({
                success: false,
                message: 'Invalid property ID.'
            });
        }

        if (
            !normalizedAddress ||
            !normalizedNeighborhood ||
            !Number.isInteger(parsedSquareFootage) ||
            parsedSquareFootage < 1 ||
            parsedGarage === null ||
            parsedPublicTransport === null
        ) {
            return res.status(400).json({
                success: false,
                message:
                    'All valid property fields are required.'
            });
        }

        try {
            const result = await pool.query(
                `
                    UPDATE properties
                    SET
                        address = $1,
                        neighborhood = $2,
                        square_footage = $3,
                        garage = $4,
                        public_transport = $5
                    WHERE
                        id = $6
                        AND owner_id = $7
                    RETURNING *
                `,
                [
                    normalizedAddress,
                    normalizedNeighborhood,
                    parsedSquareFootage,
                    parsedGarage,
                    parsedPublicTransport,
                    propertyId,
                    req.user.userId
                ]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    message:
                        'Property not found for this owner.'
                });
            }

            return res.json({
                success: true,
                message: 'Property updated!',
                property: result.rows[0]
            });
        } catch (error) {
            console.error(
                'Property update failed:',
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    'The property could not be updated.'
            });
        }
    }
);

app.delete(
    '/properties/:id',
    authenticateToken,
    requireOwner,
    async (req, res) => {
        const propertyId =
            Number(req.params.id);

        if (
            !Number.isInteger(propertyId) ||
            propertyId < 1
        ) {
            return res.status(400).json({
                success: false,
                message: 'Invalid property ID.'
            });
        }

        try {
            const result = await pool.query(
                `
                    DELETE FROM properties
                    WHERE
                        id = $1
                        AND owner_id = $2
                    RETURNING id
                `,
                [
                    propertyId,
                    req.user.userId
                ]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    message:
                        'Property not found for this owner.'
                });
            }

            return res.json({
                success: true,
                message: 'Property deleted!'
            });
        } catch (error) {
            console.error(
                'Property deletion failed:',
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    'The property could not be deleted.'
            });
        }
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
app.post('/messages', async (req, res) => {
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

    const parsedPropertyIndex =
        Number(propertyIndex);

    const parsedWorkspaceIndex =
        Number(workspaceIndex);

    if (
        !normalizedToEmail ||
        !normalizedSenderName ||
        !normalizedSenderEmail ||
        !normalizedMessage ||
        !Number.isInteger(parsedPropertyIndex) ||
        parsedPropertyIndex < 0 ||
        !Number.isInteger(parsedWorkspaceIndex) ||
        parsedWorkspaceIndex < 0
    ) {
        return res.json({
            success: false,
            message:
                'All contact fields are required.'
        });
    }

    const matchingProperty =
        properties[parsedPropertyIndex];

    if (matchingProperty) {
        const matchingWorkspace =
            matchingProperty.workspaces?.[
                parsedWorkspaceIndex
            ];

        if (!matchingWorkspace) {
            return res.json({
                success: false,
                message: 'Workspace not found.'
            });
        }

        if (
            normalizeEmail(
                matchingProperty.email
            ) !==
            normalizeEmail(
                normalizedToEmail
            )
        ) {
            return res.json({
                success: false,
                message:
                    'Owner and workspace do not match.'
            });
        }
    }

    const normalizedWorkspaceType =
        String(
            workspaceType || ''
        ).trim();

    try {
        await pool.query(
            `
                INSERT INTO contact_messages_v2 (
                    from_email,
                    to_email,
                    sender_name,
                    sender_email,
                    message,
                    property_index,
                    workspace_index,
                    workspace_type
                )
                VALUES (
                    $1,
                    $2,
                    $3,
                    $4,
                    $5,
                    $6,
                    $7,
                    $8
                )
            `,
            [
                normalizeEmail(fromEmail),
                normalizeEmail(
                    normalizedToEmail
                ),
                normalizedSenderName,
                normalizeEmail(
                    normalizedSenderEmail
                ),
                normalizedMessage,
                parsedPropertyIndex,
                parsedWorkspaceIndex,
                normalizedWorkspaceType
            ]
        );
    } catch (error) {
        console.error(
            'Message save failed:',
            error
        );

        return res.status(500).json({
            success: false,
            message:
                'Message could not be saved.'
        });
    }

    return res.json({
        success: true,
        message:
            'Message sent to owner.'
    });
});

app.get('/messages', async (req, res) => {
    const ownerEmail =
        normalizeEmail(
            req.query.ownerEmail ||
                req.query.toEmail
        );

    if (!ownerEmail) {
        return res.status(400).json({
            success: false,
            message:
                'ownerEmail is required.'
        });
    }

    try {
        const result = await pool.query(
            `
                SELECT
                    id,
                    from_email AS "fromEmail",
                    to_email AS "toEmail",
                    sender_name AS "senderName",
                    sender_email AS "senderEmail",
                    message,
                    property_index AS "propertyIndex",
                    workspace_index AS "workspaceIndex",
                    workspace_type AS "workspaceType",
                    created_at AS "createdAt"
                FROM contact_messages_v2
                WHERE to_email = $1
                ORDER BY id DESC
            `,
            [ownerEmail]
        );

        return res.json({
            success: true,
            messages: result.rows
        });
    } catch (error) {
        console.error(
            'Message load failed:',
            error
        );

        return res.status(500).json({
            success: false,
            message:
                'Messages could not be loaded.'
        });
    }
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