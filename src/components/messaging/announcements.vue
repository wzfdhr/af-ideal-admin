<template>
  <main class="messaging-page" data-testid="real-message-announcements">
    <header>
      <h1>公告</h1>
      <div class="messaging-actions">
        <button
          v-if="allowed(P.announcementCreate)"
          type="button"
          :disabled="busy"
          data-testid="messaging-announcement-new"
          @click="newAnnouncement"
        >
          新增公告
        </button>
        <button type="button" :disabled="loading || busy" @click="reload">
          刷新服务器状态
        </button>
      </div>
    </header>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="notice" role="status">{{ notice }}</p>
    <p v-if="loading" role="status">正在读取服务器公告…</p>
    <p
      v-if="
        !allowed(P.announcementRead) &&
        !allowed(P.announcementList) &&
        !allowed(P.announcementCreate)
      "
      role="alert"
    >
      当前成员无权访问公告。
    </p>
    <section
      v-if="allowed(P.announcementList) || editorOpen"
      class="messaging-grid"
    >
      <section v-if="allowed(P.announcementList)" class="messaging-panel">
        <h2>公告管理</h2>
        <form class="messaging-form" @submit.prevent="query">
          <label>
            关键词
            <input
              v-model="keyword"
              data-testid="messaging-announcement-keyword"
            />
          </label>
          <button type="submit" :disabled="loading">查询</button>
        </form>
        <ul class="messaging-list">
          <li
            v-for="row in rows"
            :key="row.id"
            :class="{ 'messaging-selected': selected?.id === row.id }"
          >
            <button
              type="button"
              :disabled="busy"
              :data-testid="`messaging-announcement-${row.id}`"
              @click="edit(row)"
            >
              {{ row.schema.title }} · {{ stateLabels[row.status] }}
            </button>
            <p class="messaging-muted">
              版本 {{ row.revision }} · {{ row.updatedAt }}
            </p>
          </li>
        </ul>
        <p v-if="!loading && !rows.length && !error">暂无公告草稿</p>
        <nav
          class="messaging-actions messaging-pagination"
          aria-label="公告管理分页"
        >
          <button
            type="button"
            :disabled="page === 1 || loading"
            @click="changePage(-1)"
          >
            上一页
          </button>
          <span>第 {{ page }} 页 / 共 {{ total }} 项</span>
          <button
            type="button"
            :disabled="page * 20 >= total || loading"
            @click="changePage(1)"
          >
            下一页
          </button>
        </nav>
      </section>
      <section v-if="editorOpen" class="messaging-panel">
        <h2>{{ selected ? `编辑公告 · ${selected.id}` : '新增公告草稿' }}</h2>
        <p class="messaging-muted">
          保存草稿后显式发布，读者只读取当前有效的发布快照。到期或撤回后服务器停止展示。
        </p>
        <p v-if="selected?.status === 'published'" class="messaging-muted">
          已有发布版本 {{ selected.publishedRevision }}，{{
            selected.draftChanged
              ? '草稿有新修改，需要另行发布；读者继续读取原发布快照。'
              : '当前草稿与发布版本一致。'
          }}
        </p>
        <form class="messaging-form" @submit.prevent="save">
          <label>
            公告标题
            <input
              v-model="draft.title"
              required
              maxlength="200"
              data-testid="messaging-announcement-title"
              :disabled="!canEdit || busy"
            />
          </label>
          <label>
            公告正文
            <textarea
              v-model="draft.content"
              required
              maxlength="5000"
              data-testid="messaging-announcement-content"
              :disabled="!canEdit || busy"
            />
          </label>
          <AudiencePicker
            v-model="draft.audience"
            :people="catalogue?.people || []"
            :roles="catalogue?.roles || []"
            :departments="catalogue?.departments || []"
            :disabled="!canEdit || busy"
          />
          <label>
            到期时间（留空表示长期有效）
            <input
              v-model="expiresAt"
              type="datetime-local"
              :disabled="!canEdit || busy"
              data-testid="messaging-announcement-expires-at"
            />
          </label>
          <div class="messaging-actions">
            <button
              v-if="canEdit"
              type="submit"
              class="messaging-primary"
              :disabled="busy || !dirty"
              data-testid="messaging-announcement-save"
            >
              保存草稿
            </button>
            <span v-if="dirty" class="messaging-muted">未保存</span>
            <button type="button" :disabled="busy" @click="closeEditor">
              关闭编辑器
            </button>
          </div>
        </form>
        <div v-if="selected" class="messaging-actions">
          <button
            v-if="
              allowed(P.announcementPublish) &&
              (selected.status !== 'published' || selected.draftChanged)
            "
            type="button"
            :disabled="busy || dirty"
            data-testid="messaging-announcement-publish"
            @click="publish"
          >
            发布已保存公告
          </button>
          <button
            v-if="
              allowed(P.announcementRevoke) && selected.status === 'published'
            "
            type="button"
            :disabled="busy || dirty"
            data-testid="messaging-announcement-revoke"
            @click="revoke"
          >
            撤回当前发布快照
          </button>
        </div>
      </section>
    </section>
    <section
      v-if="allowed(P.announcementRead)"
      class="messaging-panel"
      aria-label="当前成员可读公告"
    >
      <h2>当前成员可读公告</h2>
      <p class="messaging-muted">
        以下列表由服务器按当前租户、当前成员、接收范围和有效期核对。打开时再次核对有效发布版本。
      </p>
      <button
        type="button"
        :disabled="loading || busy"
        data-testid="messaging-published-refresh"
        @click="loadPublished"
      >
        刷新可读公告
      </button>
      <ul class="messaging-list">
        <li v-for="item in published" :key="item.id">
          <button
            type="button"
            :data-testid="`messaging-published-${item.id}`"
            @click="read(item.id)"
          >
            {{ item.title }} · 发布 {{ item.publishedAt }}
          </button>
          <p class="messaging-muted">
            发布版本 {{ item.version }} ·
            {{ item.expiresAt ? `到期 ${item.expiresAt}` : '长期有效' }}
          </p>
        </li>
      </ul>
      <p v-if="!loading && !published.length">当前没有有效且可访问的公告</p>
      <nav
        class="messaging-actions messaging-pagination"
        aria-label="可读公告分页"
      >
        <button
          type="button"
          :disabled="readerPage === 1 || loading"
          @click="changeReaderPage(-1)"
        >
          上一页
        </button>
        <span>第 {{ readerPage }} 页 / 共 {{ readerTotal }} 项</span>
        <button
          type="button"
          :disabled="readerPage * 20 >= readerTotal || loading"
          @click="changeReaderPage(1)"
        >
          下一页
        </button>
      </nav>
      <article
        v-if="reading"
        class="messaging-record"
        data-testid="messaging-announcement-read"
      >
        <h3>{{ reading.title }}</h3>
        <p class="messaging-copy">{{ reading.content }}</p>
        <p class="messaging-muted">
          有效发布快照 {{ reading.id }} · {{ reading.publishedAt }}
        </p>
        <button type="button" @click="reading = undefined">关闭正文</button>
      </article>
    </section>
  </main>
</template>
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  fetchMessagingAnnouncements,
  fetchMessagingRecipients,
  fetchPublishedAnnouncements,
  publishMessagingAnnouncement,
  readPublishedAnnouncement,
  revokeMessagingAnnouncement,
  saveMessagingAnnouncement,
} from '@/api/messaging'
import { confirmR1Action } from '@/services/r1-confirm'
import { errorMessage } from '@/views/leave/shared'
import {
  MESSAGING_PERMISSIONS as P,
  parseMessageAnnouncementDraft,
} from '@af-admin/contracts'
import { useMessagingContext } from './use-messaging-context'
import AudiencePicker from './audience-picker.vue'
import type {
  MessageAnnouncementDraft,
  MessageAnnouncementRecord,
  MessagePublishedAnnouncement,
  MessagingRecipientCatalogue,
} from '@af-admin/contracts'
import './messaging.css'

const empty = (): MessageAnnouncementDraft => ({
  title: '',
  content: '',
  audience: { scope: 'self' },
  expiresAt: null,
})
const draft = ref(empty())
const selected = ref<MessageAnnouncementRecord>()
const editorOpen = ref(false)
const expiresAt = ref('')
const original = ref('')
const rows = ref<MessageAnnouncementRecord[]>([])
const published = ref<MessagePublishedAnnouncement[]>([])
const reading = ref<MessagePublishedAnnouncement>()
const catalogue = ref<MessagingRecipientCatalogue>()
const keyword = ref('')
const page = ref(1)
const total = ref(0)
const readerPage = ref(1)
const readerTotal = ref(0)
const loading = ref(false)
const signature = () =>
  JSON.stringify({ draft: draft.value, expiresAt: expiresAt.value })
const dirty = computed(() => editorOpen.value && signature() !== original.value)
const { error, notice, busy, allowed, command, ticket } = useMessagingContext(
  () => dirty.value,
  () => {
    selected.value = undefined
    loading.value = false
    draft.value = empty()
    expiresAt.value = ''
    original.value = ''
    editorOpen.value = false
    rows.value = []
    published.value = []
    reading.value = undefined
    catalogue.value = undefined
    page.value = 1
    readerPage.value = 1
    load()
  }
)
const canEdit = computed(() =>
  allowed(selected.value ? P.announcementUpdate : P.announcementCreate)
)
const stateLabels = { draft: '草稿', published: '已发布', revoked: '已撤回' }
let listSequence = 0
let readerSequence = 0
let readSequence = 0
const toLocal = (value: string | null) => {
  if (!value) return ''
  const date = new Date(value)
  const offset = date.getTimezoneOffset() * 60000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}
const useRecord = (record: MessageAnnouncementRecord) => {
  selected.value = record
  draft.value = JSON.parse(JSON.stringify(record.schema))
  expiresAt.value = toLocal(record.schema.expiresAt)
  editorOpen.value = true
  original.value = signature()
}
async function loadRows() {
  if (!allowed(P.announcementList)) return
  const current = ticket()
  const seq = ++listSequence
  try {
    const result = await fetchMessagingAnnouncements({
      current: page.value,
      pageSize: 20,
      keyword: keyword.value,
    })
    if (current() && seq === listSequence) {
      rows.value = result.list
      total.value = result.total
    }
  } catch (failure) {
    if (current() && seq === listSequence) error.value = errorMessage(failure)
  }
}
async function loadPublished() {
  if (!allowed(P.announcementRead)) return
  const current = ticket()
  const seq = ++readerSequence
  reading.value = undefined
  readSequence += 1
  try {
    const result = await fetchPublishedAnnouncements({
      current: readerPage.value,
      pageSize: 20,
    })
    if (current() && seq === readerSequence) {
      published.value = result.list
      readerTotal.value = result.total
    }
  } catch (failure) {
    if (current() && seq === readerSequence) {
      published.value = []
      error.value = errorMessage(failure)
    }
  }
}
async function load() {
  const current = ticket()
  loading.value = true
  error.value = ''
  const tasks: Promise<unknown>[] = [loadRows(), loadPublished()]
  if (
    [P.announcementCreate, P.announcementUpdate, P.announcementPublish].some(
      allowed
    )
  )
    tasks.push(
      fetchMessagingRecipients('announcement').then((result) => {
        if (current()) catalogue.value = result
      })
    )
  try {
    await Promise.all(tasks)
  } catch (failure) {
    if (current()) error.value = errorMessage(failure)
  } finally {
    if (current()) loading.value = false
  }
}
const canDiscard = async () =>
  !dirty.value || confirmR1Action('当前公告有未保存内容，确认丢弃并继续？')
const edit = async (record: MessageAnnouncementRecord) => {
  if (busy.value) return
  const current = ticket()
  if (!(await canDiscard()) || !current()) return
  useRecord(record)
}
const newAnnouncement = async () => {
  const current = ticket()
  if (!(await canDiscard()) || !current()) return
  selected.value = undefined
  draft.value = empty()
  expiresAt.value = ''
  editorOpen.value = true
  original.value = ''
}
const closeEditor = async () => {
  const current = ticket()
  if (!(await canDiscard()) || !current()) return
  selected.value = undefined
  editorOpen.value = false
}
const reload = async () => {
  const current = ticket()
  if (!(await canDiscard()) || !current()) return
  const id = selected.value?.id
  await load()
  if (!current()) return
  if (id) {
    const record = rows.value.find((row) => row.id === id)
    if (record) useRecord(record)
    else {
      selected.value = undefined
      editorOpen.value = false
    }
  }
}
const query = () => {
  page.value = 1
  loadRows()
}
const changePage = (delta: number) => {
  page.value += delta
  loadRows()
}
const changeReaderPage = (delta: number) => {
  readerPage.value += delta
  loadPublished()
}
const save = () => {
  if (!canEdit.value) return
  let schema: MessageAnnouncementDraft
  try {
    schema = parseMessageAnnouncementDraft({
      ...draft.value,
      expiresAt: expiresAt.value
        ? new Date(expiresAt.value).toISOString()
        : null,
    })
  } catch (failure) {
    error.value = errorMessage(failure)
    return
  }
  const record = selected.value
  command(
    `announcement-save:${record?.id || 'new'}`,
    { schema, expectedRevision: record?.revision },
    (key) => saveMessagingAnnouncement(schema, key, record),
    async (result) => {
      useRecord(result)
      notice.value = '公告草稿已由服务器保存，请核对后显式发布'
      await loadRows()
    }
  )
}
const publish = () => {
  const record = selected.value
  if (!record || dirty.value || !allowed(P.announcementPublish)) return
  command(
    `announcement-publish:${record.id}`,
    { expectedRevision: record.revision },
    (key) => publishMessagingAnnouncement(record, key),
    async (result) => {
      useRecord(result)
      notice.value = '服务器已记录发布快照，当前授权读者可读取'
      await loadRows()
      await loadPublished()
    },
    '确认发布当前已保存的公告及接收范围？'
  )
}
const revoke = () => {
  const record = selected.value
  if (!record || dirty.value || !allowed(P.announcementRevoke)) return
  command(
    `announcement-revoke:${record.id}`,
    { expectedRevision: record.revision },
    (key) => revokeMessagingAnnouncement(record, key),
    async (result) => {
      useRecord(result)
      notice.value = '服务器已撤回当前公告发布快照'
      await loadRows()
      await loadPublished()
    },
    '确认撤回当前公告发布快照？读者将无法继续读取。'
  )
}
const read = async (id: string) => {
  const current = ticket()
  const seq = ++readSequence
  reading.value = undefined
  error.value = ''
  try {
    const result = await readPublishedAnnouncement(id)
    if (current() && seq === readSequence) reading.value = result
  } catch (failure) {
    if (current() && seq === readSequence) error.value = errorMessage(failure)
  }
}
onMounted(load)
</script>
