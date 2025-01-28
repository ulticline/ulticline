// (test file) 
import { vol } from "memfs"
import fs from "fs/promises"

jest.mock("fs/promises")

// in your beforeEach:
beforeEach(() => {
  vol.reset() // Clear the in-memory filesystem
  vol.fromJSON({ "/mock/path/tasks/123/uiMessages.json": JSON.stringify([]) })
})

// Now fs calls go to in-memory file system