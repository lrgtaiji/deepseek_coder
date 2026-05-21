---
name: optimize
description: Analyze and improve code performance, memory usage, and efficiency
metadata:
  type: builtin
  version: "1.0"
---

## Instructions

When a user asks to optimize code, you should:

1. **Measure first** — identify actual bottlenecks, don't guess:
   - Use Bash to run benchmarks or timing scripts
   - Look for hot loops, large allocations, blocking I/O
   - Check algorithmic complexity (O(n²) where O(n) is possible)
2. **Read** the relevant code to understand the current approach
3. **Apply optimizations** in order of impact:

### Algorithmic (highest impact)
- Replace O(n²) with O(n log n) or O(n) using Map/Set
- Avoid repeated work — memoize, cache, precompute
- Early exit from loops when condition is met

### I/O & Network
- Batch multiple reads/writes into one operation
- Use streaming instead of loading entire files into memory
- Parallelize independent async operations with Promise.all
- Add timeouts to prevent hanging

### Memory
- Avoid large array copies — use in-place mutation or iterators
- Release references for GC (set to null after use)
- Watch for closure leaks in long-lived objects
- Prefer `for...of` over `.map().filter().reduce()` chains

### Rendering (React/Ink)
- Memoize components with React.memo / useMemo
- Avoid re-renders with stable callback references (useCallback)
- Virtualize long lists
- Debounce rapid state changes

4. **Verify** — benchmark before and after to confirm improvement
5. **Document** the trade-off (speed vs readability vs memory)

## Principles

- **Don't optimize prematurely** — only optimize proven bottlenecks
- **Preserve correctness** — optimized code must pass all existing tests
- **Prefer clarity** — don't sacrifice readability for marginal gains
- **One optimization per change** — isolate changes to verify each one
- **Know when to stop** — diminishing returns after O(n) algorithmic fixes
