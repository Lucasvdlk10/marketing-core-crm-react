function constantTimeEqual(candidate: string, expected: string): boolean {
  if (candidate.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < candidate.length; index += 1) {
    difference |= candidate.charCodeAt(index) ^ expected.charCodeAt(index);
  }
  return difference === 0;
}

export function requireServiceRole(request: Request, expectedServiceRoleKey: string | undefined): void {
  const authorization = request.headers.get('authorization')?.trim() ?? '';
  const token = /^Bearer\s+(\S+)$/iu.exec(authorization)?.[1];
  if (!token || !expectedServiceRoleKey || !constantTimeEqual(token, expectedServiceRoleKey)) {
    throw new Error('service-role authorization required');
  }
}
