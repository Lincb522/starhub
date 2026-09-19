// 单一实现在 scripts/lib/repo-person.mjs（供 db.ts、脚本、测试用 Node 直接加载）；这里只为 `@/lib/repo-person` 路径转发。
export { repoPersonId } from "../../scripts/lib/repo-person.mjs";
