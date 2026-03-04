// detectParallelGroups() and groupIntoTurns()

import type { CcrRequest, OutgoingToolId } from './types';

export function detectParallelGroups(reqs: CcrRequest[]): void {
  const ridToReq = new Map<string, CcrRequest>();
  for (const req of reqs) ridToReq.set(req.reqId, req);

  const toolIdToProducer = new Map<string, string>();
  for (const req of reqs)
    for (const tc of req.outgoingToolIds)
      if (tc.id) toolIdToProducer.set(tc.id, req.reqId);

  interface GroupInfo { forkRid: string; joinRid: string; branchRids: string[]; localTools: OutgoingToolId[]; subagentTools: OutgoingToolId[]; }
  const groups = new Map<string, GroupInfo>();

  for (const req of reqs) {
    if (req.incomingToolIds.length === 0) continue;
    const producers = new Map<string, string[]>();
    for (const tid of req.incomingToolIds) {
      const prod = toolIdToProducer.get(tid);
      if (prod) { const ex = producers.get(prod) ?? []; ex.push(tid); producers.set(prod, ex); }
    }
    for (const [prodRid, tids] of producers) {
      if (tids.length >= 2 && !groups.has(prodRid))
        groups.set(prodRid, { forkRid: prodRid, joinRid: req.reqId, branchRids: [], localTools: [], subagentTools: [] });
    }
  }

  for (const [, g] of groups) {
    const forkEnd = ridToReq.get(g.forkRid)?.endTime ?? 0;
    const joinStart = ridToReq.get(g.joinRid)?.startTime ?? 0;
    for (const req of reqs) {
      if (req.reqId === g.forkRid || req.reqId === g.joinRid) continue;
      if (req.scenario === 'background' && req.startTime >= forkEnd && req.startTime <= joinStart)
        g.branchRids.push(req.reqId);
    }
  }

  for (const [gid, g] of groups) {
    const fork = ridToReq.get(g.forkRid);
    if (fork) for (const tc of fork.outgoingToolIds)
      (tc.name === 'Task' ? g.subagentTools : g.localTools).push(tc);
    if (g.subagentTools.length === 0 && g.branchRids.length === 0) { groups.delete(gid); continue; }
  }

  for (const [gid, g] of groups) {
    const fork = ridToReq.get(g.forkRid);
    if (fork) fork.parallelGroup = { role: 'fork', groupId: gid, joinRid: g.joinRid, branchCount: g.branchRids.length + 2, localTools: g.localTools, subagentTools: g.subagentTools };
    const join = ridToReq.get(g.joinRid);
    if (join) join.parallelGroup = { role: 'join', groupId: gid, forkRid: g.forkRid };
    for (const brid of g.branchRids) {
      const branch = ridToReq.get(brid);
      if (branch) branch.parallelGroup = { role: 'branch', groupId: gid, forkRid: g.forkRid };
    }
  }
}

export function groupIntoTurns(reqs: CcrRequest[]): CcrRequest[][] {
  const sorted = [...reqs].sort((a, b) => a.startTime - b.startTime);
  const turns: CcrRequest[][] = [];
  let current: CcrRequest[] = [];
  let lastStart: number | null = null;
  for (const req of sorted) {
    if (lastStart === null || req.startTime - lastStart <= 200) current.push(req);
    else { turns.push(current); current = [req]; }
    lastStart = req.startTime;
  }
  if (current.length) turns.push(current);
  return turns;
}
