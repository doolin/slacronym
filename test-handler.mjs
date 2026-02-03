import { handler } from "./index.mjs";

// Simulate a Function URL event
const testEvent = {
  requestContext: {
    http: {
      method: "GET"
    }
  },
  rawPath: "/slacronym",
  queryStringParameters: {
    text: "MAAG"
  },
  headers: {}
};

console.log("Testing handler with event:", JSON.stringify(testEvent, null, 2));
console.log("\n--- Handler Response ---\n");

handler(testEvent)
  .then(result => {
    console.log(JSON.stringify(result, null, 2));
    if (result.body) {
      console.log("\nParsed body:", JSON.parse(result.body));
    }
  })
  .catch(error => {
    console.error("Error:", error);
    process.exit(1);
  });
