// Shared, framework-free formatters for the admin portal.
export const formatLKR = (n: number) => `Rs. ${(n || 0).toLocaleString("en-US")}`;
