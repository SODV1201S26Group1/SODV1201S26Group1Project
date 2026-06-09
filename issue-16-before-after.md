# Issue #16 Before and After Notes

This file captures exactly what changed for: save owner property records into the local properties array.

## 1) Property ID Counter

File: server.js

Before:
~~~js
const users = [];
const properties = [];
~~~

After:
~~~js
const users = [];
const properties = [];
// Issue #16: local incremental id for in-memory property records.
let nextPropertyId = 1;
~~~

Why:
- Adds a unique local property id for each saved property record.

## 2) Property Save Route Validation and Record Shape

File: server.js
Route: POST /properties

Before:
~~~js
app.post('/properties', (req, res) => {
    const { email, address, neighborhood, squareFootage, garage, publicTransport } = req.body;
    properties.push({ email, address, neighborhood, squareFootage, garage, publicTransport, workspaces: [] });
    res.json({ success: true, message: 'Property added!' });
});
~~~

After:
~~~js
app.post('/properties', (req, res) => {
    const { email, address, neighborhood, squareFootage, garage, publicTransport } = req.body;
    // Issue #16: normalize and validate required property record fields.
    const ownerId = (email || '').trim().toLowerCase();
    const normalizedAddress = (address || '').trim();
    const normalizedNeighborhood = (neighborhood || '').trim();
    const parsedSquareFootage = Number(squareFootage);

    if (!ownerId || !normalizedAddress || !normalizedNeighborhood || !Number.isFinite(parsedSquareFootage) || parsedSquareFootage <= 0 || !garage || !publicTransport) {
        return res.json({ success: false, message: 'All property fields are required.' });
    }

    // Issue #16: save property and owner identifiers with required details.
    properties.push({
        propertyId: nextPropertyId++,
        ownerId,
        email: ownerId,
        address: normalizedAddress,
        neighborhood: normalizedNeighborhood,
        squareFootage: parsedSquareFootage,
        garage,
        publicTransport,
        workspaces: []
    });
    res.json({ success: true, message: 'Property added!' });
});
~~~

Why:
- Ensures required fields exist before saving.
- Saves explicit record fields required by the issue.
- Adds propertyId and ownerId so each record is identifiable.

## 3) UI Visibility of Saved IDs

File: public/my-properties.html
Function area: render property cards

Before:
~~~js
wrapper.innerHTML = `
    <div>
        <div class="property-title">${property.address}</div>
        <div class="property-meta">
            ${property.neighborhood}<br>
            ${property.squareFootage} sq ft<br>
            Garage: ${property.garage}<br>
            Public Transport: ${property.publicTransport}<br>
            Workspaces: ${property.workspaces.length}
        </div>
    </div>
`;
~~~

After:
~~~js
// Issue #16: show saved record identifiers for verification.
wrapper.innerHTML = `
    <div>
        <div class="property-title">${property.address}</div>
        <div class="property-meta">
            Property ID: ${property.propertyId}<br>
            Owner ID: ${property.ownerId}<br>
            ${property.neighborhood}<br>
            ${property.squareFootage} sq ft<br>
            Garage: ${property.garage}<br>
            Public Transport: ${property.publicTransport}<br>
            Workspaces: ${property.workspaces.length}
        </div>
    </div>
`;
~~~

Why:
- Makes it easy to verify saved identifiers in the UI during demo/testing.
