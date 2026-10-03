import {
  DomainError,
  PACKAGE_PERMISSIONS as P,
  parseApplicationPackage,
  parseApplicationCreate,
  record,
  onlyKeys,
  text,
  positiveInteger,
  parseForm,
  parseWorkflow,
  validateLeaveForm,
  FORM_DATA_SOURCE_PERMISSIONS,
  DICTIONARY_PERMISSIONS,
} from '@af-admin/contracts'
import {
  assertRevision,
  validateExecutableWorkflow,
  requirePermission,
} from '@af-admin/workflow-core'
import { authenticate, scalarHeader } from './auth'
import {
  authorizedTransaction,
  idempotent,
  rows,
  one,
  contentHash,
  audit,
  noFault,
} from './support'
import {
  requireFormSourceRead,
  cleanDraftSourceSnapshots,
} from './form-source-bindings'
import { readRelease, validatePeople } from './application'
import { provisionApplication } from './application-center'
import type {
  ApplicationPackage,
  FormSchema,
  WorkflowSchema,
} from '@af-admin/contracts'
import type { Pool } from 'pg'
import type { FastifyInstance } from 'fastify'
import type { FaultInjector } from './support'

const checksum = (pkg: ApplicationPackage) => {
  const payload = { ...pkg } as Partial<ApplicationPackage>
  delete payload.checksum
  return contentHash(payload)
}
export const registerApplicationPackages = (
  server: FastifyInstance,
  pool: Pool,
  fault: FaultInjector = noFault
) => {
  const ok = (data: unknown, traceId: string) => ({
    code: 20000,
    data,
    traceId,
  })
  server.get('/api/application-packages/people', async (request) => {
    const actor = await authenticate(pool, request)
    return authorizedTransaction(
      pool,
      actor,
      P.import,
      async (client, current) => {
        const people = await rows(
          client,
          "SELECT m.user_id AS id,COALESCE(m.display_name,u.name) AS name,(af_effective_permissions(m.tenant_id,m.user_id) ? 'workflow:approve' AND af_effective_permissions(m.tenant_id,m.user_id) ? 'workflow:reject') AS \"canApprove\" FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.tenant_id=$1 AND m.status='enabled' AND m.deleted_at IS NULL AND u.status='enabled' ORDER BY m.user_id LIMIT 100",
          [current.tenantId]
        )
        return ok(people, request.id)
      }
    )
  })
  server.get('/api/application-packages/sources', async (request) => {
    const actor = await authenticate(pool, request)
    return authorizedTransaction(
      pool,
      actor,
      P.import,
      async (client, current) => {
        requirePermission(
          current.permissions,
          FORM_DATA_SOURCE_PERMISSIONS.list
        )
        requirePermission(
          current.permissions,
          FORM_DATA_SOURCE_PERMISSIONS.read
        )
        requirePermission(current.permissions, DICTIONARY_PERMISSIONS.read)
        const sources = await rows(
          client,
          "SELECT s.id,s.name,s.code,s.kind FROM form_data_sources s JOIN dictionaries d ON d.tenant_id=s.tenant_id AND d.id=s.dictionary_id WHERE s.tenant_id=$1 AND s.status='enabled' AND d.status='enabled' AND d.deleted_at IS NULL ORDER BY s.name,s.id LIMIT 100",
          [current.tenantId]
        )
        return ok(sources, request.id)
      }
    )
  })
  server.post('/api/application-center/:id/package', async (request) => {
    const actor = await authenticate(pool, request)
    const id = text(record(request.params).id, 'id', 100)
    const body = record(request.body)
    onlyKeys(body, ['expectedRevision', 'formRevision', 'workflowRevision'])
    const expectedRevision = positiveInteger(body.expectedRevision)
    return authorizedTransaction(
      pool,
      actor,
      P.export,
      async (client, current) => {
        const app = one(
          await rows<{
            name: string
            description: string
            business_kind: 'leave' | 'generic'
            revision: number
            active_release_id: string | null
            form_draft_id: string | null
            workflow_draft_id: string | null
          }>(
            client,
            'SELECT * FROM applications WHERE tenant_id=$1 AND id=$2 FOR SHARE',
            [current.tenantId, id]
          )
        )
        assertRevision(app.revision, expectedRevision)
        let form: FormSchema
        let workflow: WorkflowSchema
        if (app.active_release_id) {
          const release = await readRelease(
            client,
            current.tenantId,
            app.active_release_id
          )
          form = parseForm(release.formSnapshot)
          workflow = parseWorkflow(release.workflowSnapshot)
        } else {
          const f = one(
            await rows<{ schema: FormSchema; revision: number }>(
              client,
              'SELECT schema,revision FROM form_drafts WHERE tenant_id=$1 AND id=$2 FOR SHARE',
              [current.tenantId, app.form_draft_id]
            )
          )
          const w = one(
            await rows<{ schema: WorkflowSchema; revision: number }>(
              client,
              'SELECT schema,revision FROM workflow_drafts WHERE tenant_id=$1 AND id=$2 FOR SHARE',
              [current.tenantId, app.workflow_draft_id]
            )
          )
          assertRevision(f.revision, positiveInteger(body.formRevision))
          assertRevision(w.revision, positiveInteger(body.workflowRevision))
          form = parseForm(f.schema)
          workflow = parseWorkflow(w.schema)
        }
        requireFormSourceRead(current, form)
        const sources: ApplicationPackage['sources'] = []
        const originalSourceIds = form.dataSources.map((binding) =>
          String(binding.registryId)
        )
        form = cleanDraftSourceSnapshots(form)
        form.dataSources.forEach((binding, index) => {
          const key = `source-${index + 1}`
          sources.push({ key, name: String(binding.name), kind: 'dictionary' })
          const previous = binding.key
          binding.key = key
          form.widgetsConfig
            .filter((widget) => widget.config.optionsSourceKey === previous)
            .forEach((widget) => {
              widget.config.optionsSourceKey = key
            })
          binding.registryId = key
        })
        const redactions: ApplicationPackage['redactions'] = []
        sources.forEach((slot, index) =>
          redactions.push({
            path: `form.dataSources.${form.dataSources[index].key}`,
            reason: 'source-snapshot-removed',
          })
        )
        form.widgetsConfig.forEach((widget) => {
          if (widget.config.defaultValue !== undefined) {
            delete widget.config.defaultValue
            redactions.push({
              path: `form.widgetsConfig.${widget.uid}.config.defaultValue`,
              reason: 'default-value-removed',
            })
          }
        })
        const slots = new Map<string, string>()
        const people: ApplicationPackage['people'] = []
        const slot = (member: string, kind: 'approver' | 'copy') => {
          const identity = `${kind}:${member}`
          let key = slots.get(identity)
          if (!key) {
            key = `person-${slots.size + 1}`
            slots.set(identity, key)
            people.push({ key, kind })
          }
          return key
        }
        workflow.nodes.forEach((node) => {
          if (node.config.formId) node.config.formId = 'form'
          if (node.config.approvers)
            node.config.approvers = node.config.approvers.map((member) =>
              slot(member, 'approver')
            )
          if (node.config.ccUsers)
            node.config.ccUsers = node.config.ccUsers.map((member) =>
              slot(member, 'copy')
            )
        })
        const packageV2 =
          sources.length > 0 || form.version === 2 || workflow.version >= 2
        if (packageV2) form.version = 2
        let workflowDependency:
          | 'serial-workflow'
          | 'conditional-workflow'
          | 'parallel-workflow'
          | 'timed-workflow' = 'serial-workflow'
        if (workflow.version === 2) workflowDependency = 'conditional-workflow'
        if (workflow.version === 3) workflowDependency = 'parallel-workflow'
        if (workflow.version === 4) workflowDependency = 'timed-workflow'
        const pkg: ApplicationPackage = {
          format: 'af-admin-application',
          version: packageV2 ? 2 : 1,
          ...(packageV2 ? { sources } : {}),
          dependencies: [
            { key: 'form-contract', version: packageV2 ? 2 : 1 },
            {
              key: workflowDependency,
              version: 1,
            },
            ...(packageV2
              ? [{ key: 'registered-sources' as const, version: 1 as const }]
              : []),
          ],
          application: {
            name: app.name,
            description: app.description,
            businessKind: app.business_kind,
          },
          references: {
            application: 'application',
            form: 'form',
            workflow: 'workflow',
          },
          people,
          form,
          workflow,
          redactions,
          checksum: '0'.repeat(64),
        }
        const identities = await rows<{ user_id: string }>(
          client,
          'SELECT user_id FROM memberships WHERE tenant_id=$1',
          [current.tenantId]
        )
        const forbidden = new Set(
          [
            current.tenantId,
            id,
            app.form_draft_id,
            app.workflow_draft_id,
            app.active_release_id,
            ...identities.map((member) => member.user_id),
            ...originalSourceIds,
          ].filter(Boolean)
        )
        const inspect = (value: unknown): void => {
          if (typeof value === 'string' && forbidden.has(value))
            throw new DomainError(
              422,
              'PACKAGE_REFERENCE_INVALID',
              '定义内容仍包含源租户对象或人员引用，请改为受控绑定'
            )
          if (Array.isArray(value)) value.forEach(inspect)
          else if (value && typeof value === 'object')
            Object.values(value).forEach(inspect)
        }
        inspect(pkg.form)
        inspect(pkg.workflow)
        pkg.checksum = checksum(pkg)
        parseApplicationPackage(pkg)
        await audit(
          client,
          current,
          'application',
          'application.package-export',
          'application',
          id,
          'success',
          { checksum: pkg.checksum, formatVersion: pkg.version }
        )
        return ok(pkg, request.id)
      }
    )
  })
  server.post(
    '/api/application-packages/import',
    { bodyLimit: 524288 },
    async (request) => {
      const actor = await authenticate(pool, request)
      const body = record(request.body)
      onlyKeys(body, [
        'package',
        'code',
        'name',
        'description',
        'bindings',
        ...(record(body.package).version === 2 ? ['sourceBindings'] : []),
      ])
      const pkg = parseApplicationPackage(body.package)
      if (checksum(pkg) !== pkg.checksum)
        throw new DomainError(
          422,
          'PACKAGE_CHECKSUM_INVALID',
          '应用包内容与摘要不一致'
        )
      const metadata = parseApplicationCreate({
        code: body.code,
        name: body.name,
        description: body.description,
        template: 'blank',
      })
      const bindings = record(body.bindings, 'bindings')
      if (
        Object.keys(bindings).length !== pkg.people.length ||
        Object.keys(bindings).some(
          (key) => !pkg.people.some((slot) => slot.key === key)
        )
      )
        throw new DomainError(
          422,
          'PACKAGE_BINDINGS_INVALID',
          '必须完整绑定包内人员槽位'
        )
      const people = Object.fromEntries(
        pkg.people.map((slot) => [
          slot.key,
          text(bindings[slot.key], 'binding', 100),
        ])
      )
      let sourceBindings: Record<string, string> | undefined
      if (pkg.version === 2) {
        const map = record(body.sourceBindings, 'sourceBindings')
        if (
          Object.keys(map).length !== pkg.sources?.length ||
          Object.keys(map).some(
            (key) => !pkg.sources?.some((slot) => slot.key === key)
          )
        )
          throw new DomainError(
            422,
            'PACKAGE_BINDINGS_INVALID',
            '必须重绑全部数据源槽位'
          )
        sourceBindings = Object.fromEntries(
          (pkg.sources || []).map((slot) => [
            slot.key,
            text(map[slot.key], 'sourceBinding', 100),
          ])
        )
      }
      const input = {
        package: pkg,
        ...metadata,
        bindings: people,
        ...(sourceBindings ? { sourceBindings } : {}),
      }
      return ok(
        await idempotent(
          pool,
          actor,
          P.import,
          'application:package-import',
          scalarHeader(request, 'idempotency-key'),
          input,
          async (client, current) => {
            const form = parseForm(pkg.form)
            if (sourceBindings)
              form.dataSources.forEach((binding) => {
                binding.registryId = sourceBindings[String(binding.registryId)]
              })
            const workflow = parseWorkflow(pkg.workflow)
            workflow.nodes.forEach((node) => {
              if (node.config.approvers)
                node.config.approvers = node.config.approvers.map(
                  (key) => people[key]
                )
              if (node.config.ccUsers)
                node.config.ccUsers = node.config.ccUsers.map(
                  (key) => people[key]
                )
            })
            validateExecutableWorkflow(workflow, form)
            await validatePeople(client, current.tenantId, workflow)
            if (pkg.application.businessKind === 'leave')
              validateLeaveForm(pkg.form)
            const created = await provisionApplication(
              client,
              current,
              metadata,
              pkg.application.businessKind,
              form,
              workflow
            )
            fault('package:application-created')
            await audit(
              client,
              current,
              'application',
              'application.package-import',
              'application',
              created.id,
              'success',
              { checksum: pkg.checksum, formatVersion: pkg.version }
            )
            return {
              application: created,
              referenceMap: {
                application: created.id,
                form: created.formDraftId,
                workflow: created.workflowDraftId,
              },
              formatVersion: pkg.version,
            }
          }
        ),
        request.id
      )
    }
  )
}
export default registerApplicationPackages
