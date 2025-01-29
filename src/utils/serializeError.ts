export function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    const serialized: Record<string, unknown> = {
      name: error.name,
      message: error.message,
      stack: error.stack,
    }

    // Handle additional properties that might exist on custom errors
    for (const key of Object.keys(error)) {
      if (key !== 'name' && key !== 'message' && key !== 'stack') {
        serialized[key] = (error as any)[key]
      }
    }

    return serialized
  }

  // If it's not an Error, try to stringify or return as-is
  try {
    return { value: JSON.stringify(error) }
  } catch {
    return { value: String(error) }
  }
} 