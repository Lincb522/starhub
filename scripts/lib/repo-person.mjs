/**
 * 仓库在本站「属于谁」：优先 GitHub owner 本人，owner 不是成员（组织仓库等）时归录入者。
 * 所有互 Star 判定都以这个 id 为准，避免用 owner 字符串匹配导致组织仓库漏判、代录仓库误判。
 *
 * 纯函数、无 Node 依赖；服务端 db.ts、客户端组件、脚本与测试共用这一份实现。
 * @param {{ ownerUserId: string | null | undefined, submitterId: string }} r
 * @returns {string}
 */
export const repoPersonId = (r) => r.ownerUserId ?? r.submitterId;
