import { defineIdentity } from 'managed-deepagents';

// The app verifies Clerk and asserts a user identity scoped to this analysis.
export const identity = defineIdentity({ auth: 'backend' });
