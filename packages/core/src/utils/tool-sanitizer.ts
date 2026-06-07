export function sanitizeToolInput(toolName: string, input: unknown): unknown {
  if (!isPlainObject(input)) {
    return input;
  }

  const sanitized: Record<string, any> = { ...input };
  removeTopLevelNulls(sanitized);

  if (toolName === "Read") {
    sanitizeReadInput(sanitized);
  }

  if (toolName === "TodoWrite") {
    sanitizeTodoWriteInput(sanitized);
  }

  return sanitized;
}

function removeTopLevelNulls(input: Record<string, any>) {
  for (const key of Object.keys(input)) {
    if (input[key] === null) {
      delete input[key];
    }
  }
}

function sanitizeReadInput(input: Record<string, any>) {
  if (input.pages === "") {
    delete input.pages;
    return;
  }

  const filePath = typeof input.file_path === "string" ? input.file_path : "";
  const isPdf = filePath.toLowerCase().endsWith(".pdf");
  if (!isPdf) {
    delete input.pages;
  }
}

function sanitizeTodoWriteInput(input: Record<string, any>) {
  if (!Array.isArray(input.todos)) {
    return;
  }

  for (const todo of input.todos) {
    if (!isPlainObject(todo)) {
      continue;
    }

    const content =
      typeof todo.content === "string" && todo.content.length > 0
        ? todo.content
        : undefined;
    const activeForm =
      typeof todo.activeForm === "string" && todo.activeForm.length > 0
        ? todo.activeForm
        : undefined;

    if (!content && activeForm) {
      todo.content = activeForm;
    }

    if (!activeForm && content) {
      todo.activeForm = content;
    }
  }
}

function isPlainObject(value: unknown): value is Record<string, any> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}
