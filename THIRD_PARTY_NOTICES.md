# Third-party components

The [MIT license](LICENSE) covers Email Host's original code. Third-party software, fonts and base images retain their own licenses.

Public application images include the installed dependency license texts and an inventory in `/usr/share/licenses/third-party`. The inventory includes build tools where present; it is not a claim that every installed package is bundled in the browser application. Missing license files and copied source components must be reviewed before a release.

Notable separately licensed components include:

| Component | License information |
| --- | --- |
| Convex JavaScript client and CLI | Apache-2.0 in the installed package metadata |
| Convex backend image | Current upstream uses FSL-1.1-Apache-2.0, with competing-use restrictions and a future Apache-2.0 grant. Verify the version corresponding to the pinned image before distributing it. [Upstream terms](https://github.com/convex/convex-backend/blob/main/LICENSE.md). |
| Noto Sans and Nunito Sans fonts | OFL-1.1; preserve their license texts |
| web-push | MPL-2.0; preserve its license and comply with applicable source requirements |

The pinned PostgreSQL, Nginx, Caddy and Bun images are separate upstream distributions with their own component notices. A release of Email Host does not relicense those images under MIT.

For local preparation, run:

```sh
bun scripts/collect-third-party-licenses.mjs --root node_modules --output .release-public/license-review
```

This inventory is a release aid, not a completed legal audit of all dependencies and included materials.
