# Examples

This directory contains working examples demonstrating various features of the Picorules compiler.

## Running Examples

Each example is a standalone TypeScript file that can be run using `ts-node`:

```bash
# Install ts-node if you haven't already
npm install -g ts-node

# Run an example
ts-node examples/01-hello-world.ts
```

Alternatively, you can compile and run them:

```bash
# Build the project first
npm run build

# Then run with node (requires modifying imports to use dist/)
node dist/examples/01-hello-world.js
```

## Available Examples

### 1. Hello World (`01-hello-world.ts`)

The simplest possible usage - compiling a single ruleblock to Oracle SQL.

**What you'll learn:**
- Basic `compile()` function usage
- How to check compilation success
- How to access generated SQL
- How to read performance metrics

**Run:**
```bash
ts-node examples/01-hello-world.ts
```

### 2. Cross-Ruleblock References (`02-cross-references.ts`)

Demonstrates how ruleblocks can reference outputs from other ruleblocks using bind statements.

**What you'll learn:**
- Bind statement syntax
- Automatic dependency resolution
- Topological sorting
- Multi-ruleblock compilation

**Run:**
```bash
ts-node examples/02-cross-references.ts
```

### 3. Transformation Pipeline (`03-transformations.ts`)

Shows all transformation features: subset selection and pruning.

**What you'll learn:**
- Subset selection (compile only specific ruleblocks)
- Output pruning (keep only ancestors)
- Input pruning (keep only descendants)
- Combined pruning (path from input to output)
- Performance optimization benefits

**Run:**
```bash
ts-node examples/03-transformations.ts
```

### 4. Both SQL Dialects (`04-both-dialects.ts`)

Compiles the same ruleblocks to both Oracle PL/SQL and SQL Server T-SQL, highlighting the differences.

**What you'll learn:**
- Oracle-specific syntax
- T-SQL-specific syntax
- Dialect differences
- Portability considerations

**Run:**
```bash
ts-node examples/04-both-dialects.ts
```

## Example Output

When you run an example, you'll see:
- ✅ Success/failure indicators
- 📋 Execution details
- 💾 Generated SQL (full or snippets)
- 📊 Performance metrics
- 🔧 Configuration details

## Understanding the Examples

All examples follow this pattern:

1. **Import**: Import compiler functions
2. **Define**: Create ruleblock definitions
3. **Compile**: Call `compile()` with options
4. **Check**: Verify success/failure
5. **Use**: Access generated SQL and metrics

## Modifying Examples

Feel free to modify these examples to experiment:

- Change ruleblock names
- Add more variables
- Try different functions
- Modify predicates
- Test error cases
- Compare dialect outputs

## Common Patterns

### Basic Compilation
```typescript
const result = compile(ruleblocks, { dialect: Dialect.ORACLE });
```

### With Subset
```typescript
const result = compile(ruleblocks, {
  dialect: Dialect.ORACLE,
  subset: ['ruleblock1', 'ruleblock2'],
});
```

### With Pruning
```typescript
const result = compile(ruleblocks, {
  dialect: Dialect.ORACLE,
  pruneOutputs: ['final_output'],
});
```

### Error Handling
```typescript
const result = compile(ruleblocks, options);

if (result.success) {
  // Use result.sql
} else {
  // Handle result.errors
}
```

## Next Steps

After running these examples:

1. Read the main [README.md](../README.md) for full API documentation
2. Explore the [test files](../tests/) for more usage patterns
3. Check the [source code](../src/) to understand internals
4. Review [PROGRESS.md](../PROGRESS.md) for implementation details

## Support

If you have questions or issues:
- Open an issue on GitHub
- Check the documentation
- Review the test files for more examples

---

**Note**: These examples assume the compiler is already built. Run `npm run build` first if you encounter import errors.
