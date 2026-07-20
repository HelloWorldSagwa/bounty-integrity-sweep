# Contributing

Thanks for helping make public bounty listings easier to verify.

## Before opening a change

1. Keep checks evidence-based and reproducible from public data.
2. Avoid heuristics that label people or projects as fraudulent.
3. Add or update tests for every behavior change.
4. Do not include tokens, private repository data, or personal information.

## Local workflow

```bash
npm test
```

The project targets Node.js 20 or newer and intentionally has no runtime dependencies.

## Pull requests

Keep pull requests focused. Explain:

- the signal being added or corrected;
- why the signal affects bounty claimability;
- the evidence returned to the operator;
- the tests used to verify the change.

Use mocked API responses in automated tests. Live GitHub calls should not be required for the test suite.

## Good first contributions

- improve CSV or JSON ergonomics;
- add fixtures for unusual GitHub issue states;
- clarify responsible-use documentation;
- improve error messages without hiding source failures.
