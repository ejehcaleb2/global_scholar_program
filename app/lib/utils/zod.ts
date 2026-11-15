import { z } from "zod";

// Disable Zod's optional Function-based parser probe under the nonce CSP.
z.config({ jitless: true });
export { z };
