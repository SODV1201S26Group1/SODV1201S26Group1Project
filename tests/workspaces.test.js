const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const { app, resetState } = require('../server');

let server;
let baseUrl;

function requestJson(path, { method = 'GET', body } = {}) {
    return new Promise((resolve, reject) => {
        const payload = body ? JSON.stringify(body) : null;
        const url = new URL(path, baseUrl);

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

async function createProperty(email) {
    const response = await requestJson('/properties', {
        method: 'POST',
        body: {
            email,
            address: '100 Test Ave',
            neighborhood: 'Central',
            squareFootage: '850',
            garage: 'No',
            publicTransport: 'Yes'
        }
    });

    assert.equal(response.body.success, true);

    const propertiesResponse = await requestJson(`/properties?email=${encodeURIComponent(email)}`);
    return propertiesResponse.body.properties[0].propertyIndex;
}

async function createWorkspace(email, propertyIndex) {
    const response = await requestJson('/workspaces', {
        method: 'POST',
        body: {
            email,
            propertyIndex,
            type: 'Desk',
            capacity: '2',
            smoking: 'No',
            availability: 'Available',
            leaseTerm: 'Month',
            price: '250'
        }
    });

    assert.equal(response.body.success, true);
}

test.before(async () => {
    server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    const address = server.address();
    baseUrl = `http://127.0.0.1:${address.port}`;
});

test.after(async () => {
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

test('workspace update rejects invalid indices', async () => {
    const response = await requestJson('/workspaces/not-a-number/0', {
        method: 'PUT',
        body: {
            email: 'owner@example.com',
            type: 'Desk',
            capacity: '2',
            smoking: 'No',
            availability: 'Available',
            leaseTerm: 'Month',
            price: '250'
        }
    });

    assert.equal(response.status, 200);
    assert.deepEqual(response.body, {
        success: false,
        message: 'Invalid workspace selection.'
    });
});

test('workspace update rejects requests from a different owner', async () => {
    const propertyIndex = await createProperty('owner@example.com');
    await createWorkspace('owner@example.com', propertyIndex);

    const response = await requestJson(`/workspaces/${propertyIndex}/0`, {
        method: 'PUT',
        body: {
            email: 'other@example.com',
            type: 'Private Office',
            capacity: '3',
            smoking: 'No',
            availability: 'Unavailable',
            leaseTerm: 'Week',
            price: '400'
        }
    });

    assert.deepEqual(response.body, {
        success: false,
        message: 'Property not found for this owner.'
    });
});

test('workspace update mutates the targeted workspace', async () => {
    const ownerEmail = 'owner@example.com';
    const propertyIndex = await createProperty(ownerEmail);
    await createWorkspace(ownerEmail, propertyIndex);

    const updateResponse = await requestJson(`/workspaces/${propertyIndex}/0`, {
        method: 'PUT',
        body: {
            email: ownerEmail,
            type: 'Meeting Room',
            capacity: '6',
            smoking: 'Yes',
            availability: 'Unavailable',
            leaseTerm: 'Week',
            price: '600'
        }
    });

    assert.deepEqual(updateResponse.body, {
        success: true,
        message: 'Workspace updated!'
    });

    const workspacesResponse = await requestJson('/workspaces');
    assert.equal(workspacesResponse.body.workspaces.length, 1);
    assert.equal(workspacesResponse.body.workspaces[0].propertyIndex, propertyIndex);
    assert.equal(workspacesResponse.body.workspaces[0].workspaceIndex, 0);
    assert.equal(workspacesResponse.body.workspaces[0].type, 'Meeting Room');
    assert.equal(workspacesResponse.body.workspaces[0].capacity, 6);
    assert.equal(workspacesResponse.body.workspaces[0].price, 600);
});

test('workspace delete reports not found for an invalid workspace index', async () => {
    const ownerEmail = 'owner@example.com';
    const propertyIndex = await createProperty(ownerEmail);
    await createWorkspace(ownerEmail, propertyIndex);

    const response = await requestJson(`/workspaces/${propertyIndex}/99`, {
        method: 'DELETE',
        body: { email: ownerEmail }
    });

    assert.deepEqual(response.body, {
        success: false,
        message: 'Workspace not found.'
    });
});

test('workspace delete removes the targeted workspace', async () => {
    const ownerEmail = 'owner@example.com';
    const propertyIndex = await createProperty(ownerEmail);
    await createWorkspace(ownerEmail, propertyIndex);

    const deleteResponse = await requestJson(`/workspaces/${propertyIndex}/0`, {
        method: 'DELETE',
        body: { email: ownerEmail }
    });

    assert.deepEqual(deleteResponse.body, {
        success: true,
        message: 'Workspace deleted!'
    });

    const workspacesResponse = await requestJson('/workspaces');
    assert.equal(workspacesResponse.body.workspaces.length, 0);
});