# Issue #16 Speaking Notes

## 60-Second Version

I worked on Issue #16, which requires saving owner property records into the local properties array with the required fields.

First, I updated the backend in [server.js](server.js) so the POST /properties route now validates required inputs before saving. I normalize the owner email into an owner ID, trim address and neighborhood values, and ensure square footage is a valid positive number.

Second, I added a local incremental property ID so each property record is uniquely identifiable in memory.

Third, I updated the saved object structure to include the required record data: propertyId, ownerId, address, neighborhood, squareFootage, garage, and publicTransport.

Finally, I updated the owner properties page in [public/my-properties.html](public/my-properties.html) to display Property ID and Owner ID so we can visually confirm records were saved correctly.

Result: owner property records are now validated, saved with required fields, and clearly verifiable in the UI.

## 20-Second Version

For Issue #16, I improved POST /properties in [server.js](server.js) to validate and normalize inputs, added a unique propertyId, and saved ownerId plus all required property fields. I also updated [public/my-properties.html](public/my-properties.html) to display Property ID and Owner ID so we can verify saved records quickly.

## Q&A Prompts (If Asked)

Q: Why add propertyId?
A: It gives each in-memory property a unique identifier and supports reliable updates/deletes later.

Q: Why normalize email to ownerId?
A: It keeps owner linking consistent and avoids mismatch issues from casing or spaces.

Q: How did you verify the change?
A: I used the owner view to check that Property ID and Owner ID render for saved records, and the route now rejects incomplete payloads.
