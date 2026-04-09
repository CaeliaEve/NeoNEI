<script setup lang="ts">
import { nextTick, ref, onMounted, watch, type ComponentPublicInstance } from 'vue';
import { api, type PatternGroup, type PatternGroupWithPatterns, type PatternWithDetails } from '../services/api';

const props = defineProps<{
  currentGroupId?: string;
  latestCreatedPatternId?: string;
}>();

const emit = defineEmits<{
  selectGroup: [groupId: string];
}>();

const patternGroups = ref<PatternGroup[]>([]);
const selectedGroup = ref<PatternGroupWithPatterns | null>(null);
const loading = ref(false);
const showCreateDialog = ref(false);
const showEditDialog = ref(false);
const newGroupName = ref('');
const newGroupDescription = ref('');
const editingGroup = ref<PatternGroup | null>(null);
const exportNotice = ref<null | {
  groupId: string;
  groupName: string;
  jsonFileName: string;
  luaFileName: string;
  luaScript: string;
  warningCount: number;
  warnings: string[];
  compatibility: string[];
}>(null);
const copyLuaStatus = ref<'idle' | 'copied' | 'failed'>('idle');
const editingPatternId = ref<string | null>(null);
const editingPatternDraft = ref<{
  patternName: string;
  priority: number;
  enabled: number;
  crafting: number;
  substitute: number;
  beSubstitute: number;
} | null>(null);
const patternRowRefs = new Map<string, HTMLElement>();

const registerPatternRow = (
  patternId: string,
  el: Element | ComponentPublicInstance | null,
) => {
  if (el instanceof HTMLElement) {
    patternRowRefs.set(patternId, el);
    return;
  }

  patternRowRefs.delete(patternId);
};

const refreshSelectedGroup = async () => {
  if (!selectedGroup.value) return;
  selectedGroup.value = await api.getPatternGroupWithPatterns(selectedGroup.value.groupId);
};

const loadPatternGroups = async () => {
  loading.value = true;
  try {
    patternGroups.value = await api.getPatternGroups();
  } catch (error) {
    console.error('Failed to load pattern groups:', error);
  } finally {
    loading.value = false;
  }
};

const selectGroup = async (groupId: string) => {
  try {
    selectedGroup.value = await api.getPatternGroupWithPatterns(groupId);
    copyLuaStatus.value = 'idle';
    editingPatternId.value = null;
    editingPatternDraft.value = null;
    emit('selectGroup', groupId);
  } catch (error) {
    console.error('Failed to load pattern group:', error);
  }
};

const createPatternGroup = async () => {
  if (!newGroupName.value.trim()) return;

  try {
    await api.createPatternGroup(newGroupName.value, newGroupDescription.value || undefined);
    newGroupName.value = '';
    newGroupDescription.value = '';
    showCreateDialog.value = false;
    await loadPatternGroups();
  } catch (error) {
    console.error('Failed to create pattern group:', error);
  }
};

const updatePatternGroup = async () => {
  if (!editingGroup.value || !editingGroup.value.groupName.trim()) return;

  try {
    await api.updatePatternGroup(
      editingGroup.value.groupId,
      editingGroup.value.groupName,
      editingGroup.value.description || undefined,
    );
    showEditDialog.value = false;
    editingGroup.value = null;
    await loadPatternGroups();
  } catch (error) {
    console.error('Failed to update pattern group:', error);
  }
};

const deletePatternGroup = async (groupId: string) => {
  if (!confirm('Delete this pattern group? All patterns in this group will also be deleted.')) return;

  try {
    await api.deletePatternGroup(groupId);
    if (selectedGroup.value?.groupId === groupId) {
      selectedGroup.value = null;
    }
    await loadPatternGroups();
  } catch (error) {
    console.error('Failed to delete pattern group:', error);
  }
};

const downloadTextFile = (fileName: string, content: string, mimeType: string) => {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

const buildOcImportLuaScript = (jsonFileName: string) => `local component = require("component")
local encoder = component.pattern_encoder

if not encoder then
  error("pattern_encoder component not found")
end

local jsonPath = "/home/${jsonFileName}"
local file = io.open(jsonPath, "r")
if not file then
  error("Could not open " .. jsonPath)
end

local json = file:read("*a")
file:close()

local ok, report = encoder.validateJson(json)
if not ok then
  error("Validation failed: " .. tostring(report))
end

print("Patterns: " .. tostring(report.patternCount))
print("Crafting: " .. tostring(report.craftingCount))
print("Processing: " .. tostring(report.processingCount))
print("Blank patterns required: " .. tostring(report.requiredBlankPatterns))
print("Blank patterns available: " .. tostring(report.availableBlankPatterns))

if not report.valid then
  print("Unresolved items detected:")
  for index, issue in pairs(report.unresolved) do
    print(string.format(
      "  [%s] pattern=%s side=%s slot=%s id=%s meta=%s count=%s reason=%s",
      tostring(index),
      tostring(issue.patternIndex),
      tostring(issue.side),
      tostring(issue.slotIndex),
      tostring(issue.id),
      tostring(issue.meta),
      tostring(issue.count),
      tostring(issue.reason)
    ))
  end
  return
end

local success, msg = encoder.loadJson(json)
print(tostring(msg))

if success then
  encoder.start()
  print("Encoding started.")
else
  print("Encoding did not start.")
end
`;

const copyExportLuaScript = async () => {
  if (!exportNotice.value?.luaScript) {
    return;
  }

  try {
    await navigator.clipboard.writeText(exportNotice.value.luaScript);
    copyLuaStatus.value = 'copied';
  } catch (error) {
    console.error('Failed to copy export Lua script:', error);
    copyLuaStatus.value = 'failed';
  }
};

const exportPatternGroup = async (groupId: string) => {
  try {
    const exportData = await api.exportPatternGroup(groupId);
    const groupName = selectedGroup.value?.groupId === groupId
      ? selectedGroup.value.groupName
      : patternGroups.value.find((group) => group.groupId === groupId)?.groupName || 'pattern-group';
    const safeGroupName = groupName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-_]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'pattern-group';
    const jsonFileName = `oc-pattern-export-${safeGroupName}-${exportData.patternCount}.json`;
    const luaFileName = `oc-pattern-import-${safeGroupName}.lua`;
    const luaScript = buildOcImportLuaScript(jsonFileName);
    downloadTextFile(jsonFileName, JSON.stringify(exportData, null, 2), 'application/json');
    downloadTextFile(luaFileName, luaScript, 'text/plain');
    exportNotice.value = {
      groupId,
      groupName,
      jsonFileName,
      luaFileName,
      luaScript,
      warningCount: exportData.warnings?.length || 0,
      warnings: exportData.warnings || [],
      compatibility: [
        `Target: ${exportData.compatibility?.target || 'oc-pattern'}`,
        `Item IDs: ${exportData.compatibility?.itemIdFormat || 'minecraft-registry'}`,
        `beSubstitute: ${exportData.compatibility?.beSubstitute || 'pattern-field'}`,
        `crafterUUID: ${exportData.compatibility?.crafterUUID || 'synthetic-pattern-id'}`,
        `author: ${exportData.compatibility?.author || 'default-exporter'}`,
      ],
    };
    copyLuaStatus.value = 'idle';
  } catch (error) {
    console.error('Failed to export pattern group:', error);
  }
};

const openEditDialog = (group: PatternGroup) => {
  editingGroup.value = { ...group };
  showEditDialog.value = true;
};

const startPatternEdit = (pattern: PatternWithDetails) => {
  editingPatternId.value = pattern.patternId;
  editingPatternDraft.value = {
    patternName: pattern.patternName,
    priority: pattern.priority,
    enabled: pattern.enabled,
    crafting: pattern.crafting,
    substitute: pattern.substitute,
    beSubstitute: pattern.beSubstitute,
  };
};

const cancelPatternEdit = () => {
  editingPatternId.value = null;
  editingPatternDraft.value = null;
};

const savePatternEdit = async (patternId: string) => {
  if (!editingPatternDraft.value) return;

  try {
    await api.updatePattern(patternId, {
      patternName: editingPatternDraft.value.patternName.trim(),
      priority: editingPatternDraft.value.priority,
      enabled: editingPatternDraft.value.enabled,
      crafting: editingPatternDraft.value.crafting,
      substitute: editingPatternDraft.value.substitute,
      beSubstitute: editingPatternDraft.value.beSubstitute,
    });
    await refreshSelectedGroup();
    cancelPatternEdit();
  } catch (error) {
    console.error('Failed to save pattern edit:', error);
  }
};

const deletePattern = async (patternId: string) => {
  if (!confirm('Delete this pattern?')) return;

  try {
    await api.deletePattern(patternId);
    await refreshSelectedGroup();
  } catch (error) {
    console.error('Failed to delete pattern:', error);
  }
};

const togglePatternBeSubstitute = async (patternId: string, currentValue: number) => {
  try {
    await api.updatePattern(patternId, {
      beSubstitute: currentValue === 1 ? 0 : 1,
    });
    await refreshSelectedGroup();
  } catch (error) {
    console.error('Failed to update pattern beSubstitute flag:', error);
  }
};

const togglePatternEnabled = async (patternId: string, currentValue: number) => {
  try {
    await api.updatePattern(patternId, {
      enabled: currentValue === 1 ? 0 : 1,
    });
    await refreshSelectedGroup();
  } catch (error) {
    console.error('Failed to update pattern enabled flag:', error);
  }
};

onMounted(() => {
  void loadPatternGroups();
  if (props.currentGroupId) {
    void selectGroup(props.currentGroupId);
  }
});

watch(
  () => props.currentGroupId,
  (groupId) => {
    if (groupId && groupId !== selectedGroup.value?.groupId) {
      void selectGroup(groupId);
    }
  },
);

watch(
  () => [props.latestCreatedPatternId, selectedGroup.value?.groupId, selectedGroup.value?.patterns.length] as const,
  async ([latestCreatedPatternId]) => {
    if (!latestCreatedPatternId) return;
    await nextTick();
    const row = patternRowRefs.get(latestCreatedPatternId);
    if (row) {
      row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  },
);
</script>

<template>
  <div class="glass-dark rounded-xl p-6">
    <div class="flex justify-between items-center mb-6">
      <h2 class="text-2xl font-bold text-white">Pattern Groups</h2>
      <button
        class="px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg hover:from-purple-600 hover:to-pink-600 transition-all shadow-lg hover:shadow-purple-500/25"
        @click="showCreateDialog = true"
      >
        + New Group
      </button>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div class="lg:col-span-1">
        <h3 class="text-lg font-semibold text-white mb-4">Group List</h3>
        <div v-if="loading" class="text-center text-gray-400 py-8">Loading...</div>
        <div v-else-if="patternGroups.length === 0" class="text-center text-gray-400 py-8">
          No groups yet. Click "New Group" to create one.
        </div>
        <div v-else class="space-y-3">
          <div
            v-for="group in patternGroups"
            :key="group.groupId"
            :class="[
              'glass rounded-lg p-4 cursor-pointer transition-all hover:shadow-lg',
              selectedGroup?.groupId === group.groupId ? 'ring-2 ring-purple-500' : ''
            ]"
            @click="selectGroup(group.groupId)"
          >
            <div class="flex justify-between items-start">
              <div class="flex-1">
                <h4 class="font-semibold text-white">{{ group.groupName }}</h4>
                <p v-if="group.description" class="text-sm text-gray-300 mt-1">{{ group.description }}</p>
                <p class="text-xs text-gray-400 mt-2">Created at {{ new Date(group.createdAt).toLocaleString('zh-CN') }}</p>
              </div>
              <div class="flex gap-2">
                <button
                  class="p-1 text-gray-400 hover:text-cyan-300 transition-colors"
                  title="Export OC Bundle"
                  @click.stop="exportPatternGroup(group.groupId)"
                >
                  ⤓
                </button>
                <button
                  class="p-1 text-gray-400 hover:text-white transition-colors"
                  title="Edit"
                  @click.stop="openEditDialog(group)"
                >
                  ✎
                </button>
                <button
                  class="p-1 text-gray-400 hover:text-red-500 transition-colors"
                  title="Delete"
                  @click.stop="deletePatternGroup(group.groupId)"
                >
                  🗑
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="lg:col-span-2">
        <h3 class="text-lg font-semibold text-white mb-4">Group Details</h3>
        <div v-if="!selectedGroup" class="text-center text-gray-400 py-8 glass rounded-lg">
          Select a group on the left to view details.
        </div>
        <div v-else class="glass rounded-lg p-6">
            <div class="flex justify-between items-start mb-6">
              <div>
                <h4 class="text-xl font-bold text-white">{{ selectedGroup.groupName }}</h4>
                <p v-if="selectedGroup.description" class="text-gray-300 mt-1">{{ selectedGroup.description }}</p>
                <p class="text-sm text-gray-400 mt-2">Contains {{ selectedGroup.patternCount }} patterns</p>
                <p class="text-xs text-amber-300/90 mt-2">
                  Export compatibility is taken from the generated OC bundle metadata.
                </p>
                <p class="text-xs text-cyan-300/80 mt-1">
                  Export downloads both the JSON artifact and a Lua helper script for validate/import/start.
                </p>
              </div>
              <button
                class="px-4 py-2 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-lg hover:from-green-600 hover:to-emerald-600 transition-all shadow-lg"
                @click="exportPatternGroup(selectedGroup.groupId)"
              >
                Export OC Bundle
              </button>
            </div>

          <div
            v-if="exportNotice && exportNotice.groupId === selectedGroup.groupId"
            class="mb-5 rounded-lg border border-cyan-400/20 bg-cyan-500/5 p-4"
          >
            <p class="text-sm font-semibold text-cyan-200">Export bundle ready</p>
            <p class="mt-2 text-xs text-cyan-100/80">JSON: {{ exportNotice.jsonFileName }}</p>
            <p class="text-xs text-cyan-100/80">Lua: {{ exportNotice.luaFileName }}</p>
            <p class="mt-2 text-xs text-cyan-100/80">
              Warnings: {{ exportNotice.warningCount }}
            </p>
            <ul class="mt-2 list-disc space-y-1 pl-4 text-xs text-cyan-100/85">
              <li v-for="entry in exportNotice.compatibility" :key="entry">{{ entry }}</li>
            </ul>
            <div class="mt-3 flex flex-wrap gap-2">
              <button
                class="px-3 py-1 rounded border border-cyan-400/30 bg-cyan-400/10 text-xs text-cyan-100 hover:bg-cyan-400/20 transition-colors"
                @click="copyExportLuaScript"
              >
                {{
                  copyLuaStatus === 'copied'
                    ? 'Lua Copied'
                    : copyLuaStatus === 'failed'
                      ? 'Copy Failed'
                      : 'Copy Lua Script'
                }}
              </button>
            </div>
            <div class="mt-3 rounded border border-white/10 bg-black/20 p-3 text-xs text-cyan-50/85">
              <p>Quick start:</p>
              <ol class="mt-2 list-decimal space-y-1 pl-4">
                <li>Move both files into your OC computer, typically under <code>/home</code>.</li>
                <li>Run the downloaded Lua helper, or paste the copied script into a file and execute it.</li>
                <li>Let <code>validateJson()</code> finish before consuming blank patterns.</li>
              </ol>
            </div>
            <ul
              v-if="exportNotice.warnings.length > 0"
              class="mt-2 list-disc space-y-1 pl-4 text-xs text-amber-200/90"
            >
              <li v-for="warning in exportNotice.warnings" :key="warning">{{ warning }}</li>
            </ul>
          </div>

          <div v-if="selectedGroup.patterns.length === 0" class="text-center text-gray-400 py-8">
            This group has no patterns yet.
          </div>
          <div v-else class="space-y-3 max-h-96 overflow-y-auto">
            <div
              v-for="pattern in selectedGroup.patterns"
              :key="pattern.patternId"
              :ref="(el) => registerPatternRow(pattern.patternId, el)"
              :class="[
                'glass rounded-lg p-4',
                props.latestCreatedPatternId === pattern.patternId ? 'ring-2 ring-cyan-400/70 shadow-[0_0_0_1px_rgba(34,211,238,0.18)]' : '',
              ]"
            >
              <div class="flex justify-between items-start">
                <div class="flex-1">
                  <template v-if="editingPatternId === pattern.patternId && editingPatternDraft">
                    <input
                      v-model="editingPatternDraft.patternName"
                      type="text"
                      class="w-full rounded border border-white/15 bg-white/5 px-3 py-2 text-sm font-semibold text-white focus:outline-none focus:ring-2 focus:ring-cyan-400/40"
                    >
                    <div class="mt-3 grid grid-cols-2 gap-3 text-sm text-gray-200">
                      <label class="flex flex-col gap-1">
                        <span class="text-xs uppercase tracking-wide text-gray-400">Priority</span>
                        <input
                          v-model.number="editingPatternDraft.priority"
                          type="number"
                          class="rounded border border-white/15 bg-white/5 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-cyan-400/40"
                        >
                      </label>
                      <label class="flex flex-col gap-1">
                        <span class="text-xs uppercase tracking-wide text-gray-400">Mode</span>
                        <select
                          v-model.number="editingPatternDraft.crafting"
                          class="rounded border border-white/15 bg-white/5 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-cyan-400/40"
                        >
                          <option :value="1">Crafting</option>
                          <option :value="0">Processing</option>
                        </select>
                      </label>
                      <label class="flex items-center gap-2 rounded border border-white/10 bg-white/5 px-3 py-2">
                        <input v-model.number="editingPatternDraft.enabled" type="checkbox" :true-value="1" :false-value="0">
                        <span>Enabled</span>
                      </label>
                      <label class="flex items-center gap-2 rounded border border-white/10 bg-white/5 px-3 py-2">
                        <input v-model.number="editingPatternDraft.substitute" type="checkbox" :true-value="1" :false-value="0">
                        <span>Substitute inputs</span>
                      </label>
                      <label class="flex items-center gap-2 rounded border border-white/10 bg-white/5 px-3 py-2">
                        <input v-model.number="editingPatternDraft.beSubstitute" type="checkbox" :true-value="1" :false-value="0">
                        <span>May substitute elsewhere</span>
                      </label>
                    </div>
                    <div class="mt-3 flex flex-wrap gap-2">
                      <button
                        class="px-3 py-1 rounded border border-cyan-400/30 bg-cyan-400/10 text-xs text-cyan-100 hover:bg-cyan-400/20 transition-colors"
                        @click="savePatternEdit(pattern.patternId)"
                      >
                        Save Pattern
                      </button>
                      <button
                        class="px-3 py-1 rounded border border-white/10 bg-white/5 text-xs text-gray-200 hover:bg-white/10 transition-colors"
                        @click="cancelPatternEdit"
                      >
                        Cancel
                      </button>
                    </div>
                  </template>
                  <template v-else>
                    <div class="flex flex-wrap items-center gap-2">
                      <h5 class="font-semibold text-white">{{ pattern.patternName }}</h5>
                      <span
                        v-if="props.latestCreatedPatternId === pattern.patternId"
                        class="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-cyan-200"
                      >
                        New
                      </span>
                    </div>
                    <div class="flex items-center gap-4 mt-2 text-sm">
                      <button
                        class="px-2 py-1 rounded border border-white/10 transition-colors"
                        :class="pattern.enabled ? 'text-green-300 bg-green-500/10' : 'text-gray-400 bg-white/5'"
                        @click="togglePatternEnabled(pattern.patternId, pattern.enabled)"
                      >
                        {{ pattern.enabled ? 'Enabled' : 'Disabled' }}
                      </button>
                      <span :class="pattern.crafting ? 'text-blue-400' : 'text-gray-400'">{{ pattern.crafting ? 'Crafting' : 'Processing' }}</span>
                      <span :class="pattern.substitute ? 'text-yellow-400' : 'text-gray-400'">{{ pattern.substitute ? 'Substitute' : 'Exact' }}</span>
                      <button
                        class="px-2 py-1 rounded border border-white/10 transition-colors"
                        :class="pattern.beSubstitute ? 'text-emerald-300 bg-emerald-500/10' : 'text-gray-400 bg-white/5'"
                        @click="togglePatternBeSubstitute(pattern.patternId, pattern.beSubstitute)"
                      >
                        {{ pattern.beSubstitute ? 'May Substitute' : 'No Alt Use' }}
                      </button>
                      <span class="text-gray-400">Priority {{ pattern.priority }}</span>
                    </div>
                  </template>
                </div>
                <div class="flex gap-2">
                  <button
                    class="p-1 text-gray-400 hover:text-cyan-300 transition-colors"
                    title="Edit Pattern"
                    @click="startPatternEdit(pattern)"
                  >
                    ✎
                  </button>
                  <button
                    class="p-1 text-gray-400 hover:text-red-500 transition-colors"
                    title="Delete"
                    @click="deletePattern(pattern.patternId)"
                  >
                    🗑
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="showCreateDialog" class="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
      <div class="glass-dark rounded-xl p-6 w-full max-w-md shadow-2xl">
        <h3 class="text-xl font-bold text-white mb-4">Create Group</h3>
        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-300 mb-1">Group Name</label>
            <input
              v-model="newGroupName"
              type="text"
              class="w-full px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
              placeholder="e.g. Basic Resource Patterns"
            >
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-300 mb-1">Description (optional)</label>
            <textarea
              v-model="newGroupDescription"
              rows="3"
              class="w-full px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
              placeholder="Short description for this group"
            ></textarea>
          </div>
        </div>
        <div class="flex justify-end gap-3 mt-6">
          <button
            class="px-4 py-2 text-gray-300 hover:text-white transition-colors"
            @click="showCreateDialog = false; newGroupName = ''; newGroupDescription = '';"
          >
            Cancel
          </button>
          <button
            class="px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg hover:from-purple-600 hover:to-pink-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            :disabled="!newGroupName.trim()"
            @click="createPatternGroup"
          >
            Create
          </button>
        </div>
      </div>
    </div>

    <div v-if="showEditDialog && editingGroup" class="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
      <div class="glass-dark rounded-xl p-6 w-full max-w-md shadow-2xl">
        <h3 class="text-xl font-bold text-white mb-4">Edit Group</h3>
        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-300 mb-1">Group Name</label>
            <input
              v-model="editingGroup.groupName"
              type="text"
              class="w-full px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-300 mb-1">Description (optional)</label>
            <textarea
              v-model="editingGroup.description"
              rows="3"
              class="w-full px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
            ></textarea>
          </div>
        </div>
        <div class="flex justify-end gap-3 mt-6">
          <button
            class="px-4 py-2 text-gray-300 hover:text-white transition-colors"
            @click="showEditDialog = false; editingGroup = null;"
          >
            Cancel
          </button>
          <button
            class="px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg hover:from-purple-600 hover:to-pink-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            :disabled="!editingGroup.groupName.trim()"
            @click="updatePatternGroup"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
