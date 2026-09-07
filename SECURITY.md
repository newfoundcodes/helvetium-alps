# Security

Helvetium Alps does not concatenate application values into SQL. Query-builder values are bound through adapter parameters. Raw SQL remains an explicit trust boundary: use parameter bindings or the `sql` tagged-template helpers rather than interpolating untrusted strings.

Database credentials must be supplied through application configuration or secret managers and must not be embedded in source code. Enable TLS and server certificate verification when supported by the database driver.

Report security issues privately to the Newfoundcodes maintainers before public disclosure.
