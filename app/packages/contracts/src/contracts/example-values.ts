// Example ids shared by contract examples (catalog meta), so related examples
// point at each other. Firestore automatic ids: opaque, 20 chars (ADR 0005).
export const EXAMPLE_IDS = {
  organization: "Jd8sK2lPq0WnR5tYu3bV",
  project: "Pq4rS6tU8vW0xY2zA1bC",
  unitRoot: "Ua2bC4dE6fG8hJ0kL1mN",
  unit: "Un5mK7pQ9rS1tV3wX6yZ",
  user: "uA1b2C3d4E5f6G7h8I9j",
  otherUser: "uZ9y8X7w6V5u4T3s2R1q",
  role: "Rl3kJ5hG7fD9sA1qW2eR",
  membership: "Mb6nB8vC0xZ2lK4jH6gF",
  invitation: "Iv7cX9zA1sD3fG5hJ7kL",
  device: "Dv1qA3zW5sX7eD9cR2fV",
  deviceActivation: "Da4tG6bY8hN0uJ2mI4kO",
  apiKey: "Ak2wS4xE6dC8rF0vT1gB",
  session: "Ss8yH0nU2jM4iK6oL8pZ",
  impersonationSession: "Im5rT7yU9iO1pA3sD5fG",
  approvalRequest: "Ar9oP1lK3jH5gF7dS9aQ",
  auditLogEntry: "Al6mN8bV0cX2zL4kJ6hG",
} as const;

export const EXAMPLE_TIMES = {
  created: "2026-09-29T14:30:00.000Z",
  updated: "2026-09-29T15:00:00.000Z",
  expires: "2026-10-06T14:30:00.000Z",
} as const;

export const EXAMPLE_REQUEST_ID = "01J8Z3K4M5N6P7Q8R9S0T1V2W3";
