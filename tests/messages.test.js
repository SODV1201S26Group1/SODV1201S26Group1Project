const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

let app;
let resetState;
let server;
let baseUrl;

if (!process.env.DATABASE_URL) {
    test('messages tests require DATABASE_URL', { skip: true }, () => {});
} else {
    const { initializeDatabase } = require('../db');
    ({ app, resetState } = require('../server'));

    function requestJson(pathname, { method = 'GET', body } = {}) {
        return new Promise((resolve, reject) => {
            const payload = body ? JSON.stringify(body) : null;
            const url = new URL(pathname, baseUrl);

            const req = http.request(
                url,
                {
                    method,
                    headers: payload
                        ? {
                            'Content-Type': 'application/json',
                            'Content-Length': Buffer.byteLength(payload)
                        }
                        : undefined
                },
                (res) => {
                    let raw = '';
                    res.setEncoding('utf8');
                    res.on('data', (chunk) => {
                        raw += chunk;
                    });
                    res.on('end', () => {
                        resolve({
                            status: res.statusCode,
                            body: raw ? JSON.parse(raw) : null
                        });
                    });
                }
            );

            req.on('error', reject);

            if (payload) {
                req.write(payload);
            }

            req.end();
        });
    }

    test.before(async () => {
        await initializeDatabase();

        server = app.listen(0);
        await new Promise((resolve) => server.once('listening', resolve));
        const address = server.address();
        baseUrl = `http://127.0.0.1:${address.port}`;
    });

    test.after(async () => {
        if (!server) {
            return;
        }

        await new Promise((resolve, reject) => {
            server.close((error) => {
                if (error) {
                    reject(error);
                    return;
                }

                resolve();
            });
        });
    });

    test.beforeEach(() => {
        resetState();
    });

    test('message endpoint rejects missing fields', async () => {
        const response = await requestJson('/messages', {
            method: 'POST',
            body: {
                fromEmail: 'coworker@example.com',
                toEmail: 'owner@example.com',
                senderName: 'Coworker User',
                senderEmail: 'coworker@example.com',
                message: '',
                propertyIndex: 0,
                workspaceIndex: 0,
                workspaceType: 'Desk'
            }
        });

        assert.deepEqual(response.body, {
            success: false,
            message: 'All contact fields are required.'
        });
    });

    test('message endpoint saves and loads database records', async () => {
        const ownerEmail = 'owner-persist@example.com';

        const sendResponse = await requestJson('/messages', {
            method: 'POST',
            body: {
                fromEmail: 'coworker@example.com',
                toEmail: ownerEmail,
                senderName: 'Coworker User',
                senderEmail: 'coworker@example.com',
                message: 'Is this workspace still available this week?',
                propertyIndex: 0,
                workspaceIndex: 0,
                workspaceType: 'Desk'
            }
        });

        assert.deepEqual(sendResponse.body, {
            success: true,
            message: 'Message sent to owner.'
        });

        const messagesResponse = await requestJson(`/messages?ownerEmail=${encodeURIComponent(ownerEmail)}`);

        assert.equal(messagesResponse.body.success, true);
        assert.equal(messagesResponse.body.messages.length, 1);
        assert.equal(messagesResponse.body.messages[0].toEmail, ownerEmail);
        assert.equal(messagesResponse.body.messages[0].propertyIndex, 0);
        assert.equal(messagesResponse.body.messages[0].workspaceIndex, 0);
        assert.equal(messagesResponse.body.messages[0].senderEmail, 'coworker@example.com');
    });
}

