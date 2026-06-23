<template>
  <section data-testid="user-attachment-panel" class="attachment-panel">
    <div class="attachment-header">
      <div>
        <h3>个人附件</h3>
        <p>集中维护员工资料、入职文件和权限可见范围，便于审计和交付核验。</p>
      </div>
      <a-button type="primary">上传资料</a-button>
    </div>

    <div class="attachment-grid">
      <div class="attachment-card">
        <div class="card-title">最近上传</div>
        <ul class="attachment-list">
          <li v-for="item in attachments" :key="item.name">
            <div>
              <strong>{{ item.name }}</strong>
              <span>{{ item.type }}</span>
            </div>
            <a-tag :color="item.status === '已归档' ? 'green' : 'orange'">
              {{ item.status }}
            </a-tag>
          </li>
        </ul>
      </div>

      <div class="attachment-card">
        <div class="card-title">资料类型</div>
        <div class="tag-list">
          <a-tag>身份证明</a-tag>
          <a-tag>劳动合同</a-tag>
          <a-tag>学历证书</a-tag>
          <a-tag>保密协议</a-tag>
        </div>
      </div>

      <div class="attachment-card">
        <div class="card-title">权限说明</div>
        <p>
          个人附件默认仅本人、人事管理员和审计员可见。敏感资料下载、预览和删除需要记录审计日志。
        </p>
      </div>

      <div class="attachment-card">
        <div class="card-title">上传规范</div>
        <p>支持 PDF、JPG、PNG、DOCX，单个文件不超过 20MB。</p>
        <p>
          证件类资料必须命名清晰，避免上传包含明文密码或真实生产密钥的文件。
        </p>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
const attachments = [
  {
    name: '身份证明',
    type: 'PDF / 2026-06-20',
    status: '已归档',
  },
  {
    name: '劳动合同',
    type: 'DOCX / 2026-06-18',
    status: '待复核',
  },
  {
    name: '保密协议',
    type: 'PDF / 2026-06-16',
    status: '已归档',
  },
]
</script>

<style scoped>
.attachment-panel {
  padding: 16px;
}

.attachment-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}

.attachment-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.attachment-header p,
.attachment-card p {
  margin: 6px 0 0;
  color: #667085;
  line-height: 1.6;
}

.attachment-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.attachment-card {
  min-height: 120px;
  padding: 14px;
  border: 1px solid #e5e6eb;
  border-radius: 6px;
  background: #fff;
}

.card-title {
  margin-bottom: 10px;
  font-weight: 600;
  color: #1d2129;
}

.attachment-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 0;
  margin: 0;
  list-style: none;
}

.attachment-list li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.attachment-list strong,
.attachment-list span {
  display: block;
}

.attachment-list span {
  margin-top: 4px;
  color: #86909c;
  font-size: 12px;
}

.tag-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
</style>
