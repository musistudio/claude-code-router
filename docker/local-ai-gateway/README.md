This directory is used by `npm run docker:prepare-gateway`,
`npm run docker:build`, `npm run docker:compose:build`, and
`npm run docker:compose:up`.

Generated `.tgz` files are ignored by Git. They are copied into the Docker
build context so the image can bundle a local plugin-capable ai-gateway runtime
instead of the package-lock dependency.
