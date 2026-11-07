import { useEffect, useState } from 'react';
import { validateDraft, type Draft } from './drafts.ts';

const API = 'https://marketplace.cheaply.fr/marketplace/api/photoeditor';
export const SIGN_IN = 'https://marketplace.cheaply.fr/marketplace/photoeditor';
export type Member = { id: string; name: string };
export type CloudLink = { id: string; generation: string; owner: string };
export type CloudProject = {
  id: string;
  name: string;
  updatedAt: string;
  generation: string;
  bytes: number;
};
export type CloudSession =
  | { authenticated: false }
  | { authenticated: true; user: Member };

/**
 * A generation mismatch means the authenticated project was edited from
 * another device or browser since this document was opened. Keep the project
 * identity on the error so the editor can offer an explicit, validated reload
 * path while leaving the current local edits untouched.
 */
export class CloudConflictError extends Error {
  readonly projectId: string | undefined;
  readonly generation: string | undefined;

  constructor(
    message: string,
    projectId?: string,
    generation?: string,
  ) {
    super(message);
    this.name = 'CloudConflictError';
    this.projectId = projectId;
    this.generation = generation;
  }
}

const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const token = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length >= 1 &&
  value.length <= 160 &&
  !Array.from(value).some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127;
  });
const fail = (message = 'Cloud response is invalid'): never => {
  throw new Error(message);
};
const expectToken = (
  value: unknown,
  message = 'Invalid cloud request',
): string => {
  if (!token(value)) throw new Error(message);
  return value;
};

export function validMember(value: unknown): value is Member {
  return (
    record(value) &&
    token(value.id) &&
    typeof value.name === 'string' &&
    value.name.length >= 1 &&
    value.name.length <= 160
  );
}

export function validateCloudSession(value: unknown): CloudSession {
  if (!record(value) || typeof value.authenticated !== 'boolean') return fail();
  if (!value.authenticated) return { authenticated: false };
  if (!validMember(value.user)) return fail();
  return { authenticated: true, user: value.user };
}

export function validCloudProject(value: unknown): value is CloudProject {
  return (
    record(value) &&
    token(value.id) &&
    typeof value.name === 'string' &&
    value.name.length <= 160 &&
    token(value.updatedAt) &&
    token(value.generation) &&
    typeof value.bytes === 'number' &&
    Number.isSafeInteger(value.bytes) &&
    value.bytes >= 0 &&
    value.bytes <= 64 * 1024 * 1024
  );
}

export function validateCloudProjectList(value: unknown): {
  projects: CloudProject[];
} {
  if (
    !record(value) ||
    !Array.isArray(value.projects) ||
    value.projects.length > 30 ||
    !value.projects.every(validCloudProject)
  )
    return fail();
  return { projects: value.projects };
}

export function validateCloudOpen(value: unknown): {
  id: string;
  generation: string;
  document: Draft;
} {
  if (
    !record(value) ||
    !token(value.id) ||
    !token(value.generation) ||
    value.document === undefined
  )
    return fail();
  return {
    id: value.id,
    generation: value.generation,
    document: validateDraft(value.document),
  };
}

export function validateCloudSave(value: unknown): {
  id: string;
  generation: string;
} {
  if (!record(value) || !token(value.id) || !token(value.generation))
    return fail();
  return { id: value.id, generation: value.generation };
}

export function validateCloudDelete(value: unknown): { deleted: boolean } {
  if (!record(value) || typeof value.deleted !== 'boolean') return fail();
  return { deleted: value.deleted };
}

async function request<T>(
  query = '',
  payload: unknown,
  parse: (value: unknown) => T,
): Promise<T> {
  const response = await fetch(API + query, {
    credentials: 'include',
    cache: 'no-store',
    signal: AbortSignal.timeout(30000),
    ...(payload !== undefined
      ? {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: JSON.stringify(payload),
        }
      : {}),
  });
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = undefined;
  }
  if (!response.ok) {
    const message =
      record(body) && typeof body.error === 'string'
        ? body.error
        : 'Cloud projects are unavailable';
    if (response.status === 409) {
      const request = record(payload) ? payload : undefined;
      const bodyRecord = record(body) ? body : undefined;
      throw new CloudConflictError(
        message,
        token(bodyRecord?.id) ? bodyRecord.id : token(request?.id) ? request.id : undefined,
        token(bodyRecord?.generation)
          ? bodyRecord.generation
          : token(request?.generation)
            ? request.generation
            : undefined,
      );
    }
    throw new Error(message);
  }
  return parse(body);
}
export function useMember() {
  const [member, setMember] = useState<Member | null>(null);
  const [checking, setChecking] = useState(true);
  // True when the account service could not be reached or answered with an
  // error, so the editor can explain instead of linking to a broken page.
  const [unavailable, setUnavailable] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    let sequence = 0;
    const refresh = () => {
      const latest = ++sequence;
      void request('?action=session', undefined, validateCloudSession)
        .then((value) => {
          if (!active || latest !== sequence) return;
          setMember(value.authenticated ? value.user : null);
          setUnavailable(false);
        })
        .catch(() => {
          /* Editing remains available when sign-in is unavailable. */
          if (active && latest === sequence) setUnavailable(true);
        })
        .finally(() => {
          if (active) setChecking(false);
        });
    };
    refresh();
    window.addEventListener('focus', refresh);
    return () => {
      active = false;
      window.removeEventListener('focus', refresh);
    };
  }, [attempt]);
  const retry = () => {
    setChecking(true);
    setAttempt((value) => value + 1);
  };
  return { member, checking, unavailable, retry };
}
export const listCloudProjects = () =>
  request('', undefined, validateCloudProjectList);
export const openCloudProject = (id: string) =>
  request(
    '?id=' + encodeURIComponent(expectToken(id)),
    undefined,
    validateCloudOpen,
  );
export const saveCloudProject = (
  id: string,
  generation: string,
  document: Draft,
) =>
  request(
    '',
    {
      action: 'save',
      id: expectToken(id),
      generation: expectToken(generation),
      document: validateDraft(document),
    },
    validateCloudSave,
  );
export const removeCloudProject = (id: string, generation: string) =>
  request(
    '',
    {
      action: 'delete',
      id: expectToken(id),
      generation: expectToken(generation),
    },
    validateCloudDelete,
  );
