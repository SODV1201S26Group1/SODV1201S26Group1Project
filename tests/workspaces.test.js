const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

let app;
let resetState;
let server;
let baseUrl;

if (!process.env.DATABASE_URL) {
    test('workspace tests require DATABASE_URL', { skip: true }, () => {});
} else {
    const { initializeDatabase, pool } = require('../db');
    ({ app, resetState } = require('../server'));

    function requestJson(pathname, { method = 'GET', body, token } = {}) {
        return new Promise((resolve, reject) => {
            const payload = body ? JSON.stringify(body) : null;
            const url = new URL(pathname, baseUrl);
            const headers = {};

            if (payload) {
                headers['Content-Type'] = 'application/json';
                headers['Content-Length'] = Buffer.byteLength(payload);
            }

            if (token) {
                headers.Authorization = `Bearer ${token}`;
            }

            const req = http.request(
                url,
                {
                    method,
                    headers: Object.keys(headers).length > 0 ? headers : undefined
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

    async function registerAndLoginOwner(tag) {
        const uniqueSuffix = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
        const email = `owner.${tag}.${uniqueSuffix}@example.com`;

        const registerResponse = await requestJson('/register', {
            method: 'POST',
            body: {
                name: `Owner ${tag}`,
                phone: '4035551000',
                email,
                password: 'Owner@1234',
                role: 'owner'
            }
        });

        assert.equal(registerResponse.body.success, true);

        const loginResponse = await requestJson('/login', {
            method: 'POST',
            body: {
                email,
                password: 'Owner@1234'
            }
        });

        assert.equal(loginResponse.body.success, true);
        assert.ok(loginResponse.body.token);

        return {
            email,
            token: loginResponse.body.token
        };
    }

    async function createProperty(token, tag) {
        const response = await requestJson('/properties', {
            method: 'POST',
            token,
            body: {
                address: `${tag} Test Ave`,
                neighborhood: 'Central',
                squareFootage: 850,
                garage: 'No',
                publicTransport: 'Yes'
            }
        });

        assert.equal(response.status, 201);
        assert.equal(response.body.success, true);
        return response.body.property.id;
    }

    async function createWorkspace(token, propertyIndex) {
        const response = await requestJson('/workspaces', {
            method: 'POST',
            token,
            body: {
                propertyIndex,
                type: 'Desk',
                capacity: 2,
                smoking: 'No',
                availability: 'Available',
                leaseTerm: 'Month',
                price: 250
            }
        });

        assert.equal(response.body.success, true);
        return response.body.workspace.workspaceIndex;
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

    test.beforeEach(async () => {
        await resetState();
    });

    test('workspace create persists a new workspace for owner property', async () => {
        const owner = await registerAndLoginOwner('createworkspace');
        const propertyIndex = await createProperty(owner.token, 'CreateWorkspace');

        const response = await requestJson('/workspaces', {
            method: 'POST',
            token: owner.token,
            body: {
                propertyIndex,
                type: 'Private Office',
                capacity: 4,
                smoking: 'No',
                availability: 'Available',
                leaseTerm: 'Month',
                price: 850
            }
        });

        assert.equal(response.status, 200);
        assert.equal(response.body.success, true);
        assert.equal(response.body.workspace.propertyIndex, propertyIndex);
        assert.equal(response.body.workspace.type, 'Private Office');
        assert.equal(response.body.workspace.capacity, 4);
        assert.equal(response.body.workspace.smoking, 'No');
        assert.equal(response.body.workspace.availability, 'Available');
        assert.equal(response.body.workspace.leaseTerm, 'Month');
        assert.equal(response.body.workspace.price, 850);

        const dbWorkspaceResult = await pool.query(
            `
                SELECT property_id, owner_id, type, capacity, smoking, availability, rental_term, price
                FROM workspaces
                WHERE id = $1
            `,
            [response.body.workspace.workspaceIndex]
        );

        assert.equal(dbWorkspaceResult.rows.length, 1);
        assert.equal(dbWorkspaceResult.rows[0].property_id, propertyIndex);
        assert.equal(dbWorkspaceResult.rows[0].type, 'Private Office');
        assert.equal(dbWorkspaceResult.rows[0].capacity, 4);
        assert.equal(dbWorkspaceResult.rows[0].smoking, false);
        assert.equal(dbWorkspaceResult.rows[0].availability, 'Available');
        assert.equal(dbWorkspaceResult.rows[0].rental_term, 'Month');
        assert.equal(Number(dbWorkspaceResult.rows[0].price), 850);
    });

    test('workspace create rejects unauthenticated request', async () => {
        const response = await requestJson('/workspaces', {
            method: 'POST',
            body: {
                propertyIndex: 1,
                type: 'Desk',
                capacity: 2,
                smoking: 'No',
                availability: 'Available',
                leaseTerm: 'Month',
                price: 250
            }
        });

        assert.equal(response.status, 401);
        assert.deepEqual(response.body, {
            success: false,
            message: 'Authentication token is required.'
        });
    });

    test('workspace create rejects property owned by another owner', async () => {
        const ownerOne = await registerAndLoginOwner('createownerone');
        const ownerTwo = await registerAndLoginOwner('createownertwo');

        const propertyIndex = await createProperty(ownerOne.token, 'OwnerOneProperty');

        const response = await requestJson('/workspaces', {
            method: 'POST',
            token: ownerTwo.token,
            body: {
                propertyIndex,
                type: 'Desk',
                capacity: 2,
                smoking: 'No',
                availability: 'Available',
                leaseTerm: 'Month',
                price: 250
            }
        });

        assert.equal(response.status, 404);
        assert.deepEqual(response.body, {
            success: false,
            message: 'Property not found for this owner.'
        });
    });

    test('workspace create rejects invalid payload', async () => {
        const owner = await registerAndLoginOwner('createinvalid');
        const propertyIndex = await createProperty(owner.token, 'CreateInvalid');

        const response = await requestJson('/workspaces', {
            method: 'POST',
            token: owner.token,
            body: {
                propertyIndex,
                type: '',
                capacity: 0,
                smoking: 'Maybe',
                availability: '',
                leaseTerm: '',
                price: 0
            }
        });

        assert.equal(response.status, 400);
        assert.deepEqual(response.body, {
            success: false,
            message: 'Please fill in all required workspace fields.'
        });
    });

    test('workspace list requires authentication token', async () => {
        const response = await requestJson('/workspaces');

        assert.equal(response.status, 401);
        assert.deepEqual(response.body, {
            success: false,
            message: 'Authentication token is required.'
        });
    });

    test('workspace list returns created workspace payload shape', async () => {
        const owner = await registerAndLoginOwner('listworkspace');
        const propertyIndex = await createProperty(owner.token, 'ListWorkspace');
        const workspaceIndex = await createWorkspace(owner.token, propertyIndex);

        const response = await requestJson('/workspaces', {
            token: owner.token
        });

        assert.equal(response.status, 200);
        assert.equal(response.body.success, true);

        const workspace = response.body.workspaces.find(
            (entry) =>
                entry.propertyIndex === propertyIndex &&
                entry.workspaceIndex === workspaceIndex
        );

        assert.ok(workspace);
        assert.equal(workspace.type, 'Desk');
        assert.equal(workspace.capacity, 2);
        assert.equal(workspace.smoking, 'No');
        assert.equal(typeof workspace.address, 'string');
        assert.equal(typeof workspace.neighborhood, 'string');
        assert.equal(workspace.ownerEmail, owner.email);
    });

    test('workspace update rejects invalid indices', async () => {
        const { token } = await registerAndLoginOwner('invalidindices');

        const response = await requestJson('/workspaces/not-a-number/0', {
            method: 'PUT',
            token,
            body: {
                type: 'Desk',
                capacity: 2,
                smoking: 'No',
                availability: 'Available',
                leaseTerm: 'Month',
                price: 250
            }
        });

        assert.equal(response.status, 200);
        assert.deepEqual(response.body, {
            success: false,
            message: 'Invalid workspace selection.'
        });
    });

    test('workspace update rejects requests from a different owner', async () => {
        const ownerOne = await registerAndLoginOwner('ownerone');
        const ownerTwo = await registerAndLoginOwner('ownertwo');

        const propertyIndex = await createProperty(ownerOne.token, 'OwnerOne');
        const workspaceIndex = await createWorkspace(ownerOne.token, propertyIndex);

        const response = await requestJson(`/workspaces/${propertyIndex}/${workspaceIndex}`, {
            method: 'PUT',
            token: ownerTwo.token,
            body: {
                type: 'Private Office',
                capacity: 3,
                smoking: 'No',
                availability: 'Unavailable',
                leaseTerm: 'Week',
                price: 400
            }
        });

        assert.equal(response.status, 404);
        assert.deepEqual(response.body, {
            success: false,
            message: 'Property not found for this owner.'
        });
    });

    test('workspace update mutates the targeted workspace', async () => {
        const owner = await registerAndLoginOwner('mutate');
        const propertyIndex = await createProperty(owner.token, 'Mutate');
        const workspaceIndex = await createWorkspace(owner.token, propertyIndex);

        const updateResponse = await requestJson(`/workspaces/${propertyIndex}/${workspaceIndex}`, {
            method: 'PUT',
            token: owner.token,
            body: {
                type: 'Meeting Room',
                capacity: 6,
                smoking: 'Yes',
                availability: 'Unavailable',
                leaseTerm: 'Week',
                price: 600
            }
        });

        assert.deepEqual(updateResponse.body, {
            success: true,
            message: 'Workspace updated!'
        });

        const workspacesResponse = await requestJson('/workspaces', {
            token: owner.token
        });

        assert.equal(workspacesResponse.body.success, true);

        const workspace = workspacesResponse.body.workspaces.find(
            (entry) =>
                entry.propertyIndex === propertyIndex &&
                entry.workspaceIndex === workspaceIndex
        );

        assert.ok(workspace);
        assert.equal(workspace.type, 'Meeting Room');
        assert.equal(workspace.capacity, 6);
        assert.equal(workspace.smoking, 'Yes');
        assert.equal(workspace.availability, 'Unavailable');
        assert.equal(workspace.leaseTerm, 'Week');
        assert.equal(workspace.price, 600);
    });

    test('workspace delete reports not found for an invalid workspace index', async () => {
        const owner = await registerAndLoginOwner('invaliddelete');
        const propertyIndex = await createProperty(owner.token, 'DeleteInvalid');
        await createWorkspace(owner.token, propertyIndex);

        const response = await requestJson(`/workspaces/${propertyIndex}/999999`, {
            method: 'DELETE',
            token: owner.token
        });

        assert.equal(response.status, 404);
        assert.deepEqual(response.body, {
            success: false,
            message: 'Workspace not found.'
        });
    });

    test('workspace delete removes the targeted workspace', async () => {
        const owner = await registerAndLoginOwner('deletesuccess');
        const propertyIndex = await createProperty(owner.token, 'DeleteSuccess');
        const workspaceIndex = await createWorkspace(owner.token, propertyIndex);

        const deleteResponse = await requestJson(`/workspaces/${propertyIndex}/${workspaceIndex}`, {
            method: 'DELETE',
            token: owner.token
        });

        assert.deepEqual(deleteResponse.body, {
            success: true,
            message: 'Workspace deleted!'
        });

        const workspacesResponse = await requestJson('/workspaces', {
            token: owner.token
        });

        const deletedWorkspace = workspacesResponse.body.workspaces.find(
            (entry) =>
                entry.propertyIndex === propertyIndex &&
                entry.workspaceIndex === workspaceIndex
        );

        assert.equal(deletedWorkspace, undefined);
    });
}