import { vi } from "vitest";
import "@testing-library/jest-dom/vitest";

// jsdom doesn't implement scrollIntoView; stub it so components that call it
// during effects don't throw.
Element.prototype.scrollIntoView = vi.fn();
