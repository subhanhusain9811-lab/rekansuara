// storage.js
import Dexie from 'https://cdn.jsdelivr.net/npm/dexie@4.0.8/+esm';

// 1. Inisialisasi Database IndexedDB
export const db = new Dexie('RekanSuaraDB');
db.version(1).stores({
  recordings: '++id, title, createdAt, duration, statusAI, opfsKey',
  transcripts: '++id, recordingId, text, createdAt',
  settings: 'key'
});

// 2. Helper Origin Private File System (OPFS) untuk Berkas Audio Biner
export const opfsStorage = {
  async getRoot() {
    return await navigator.storage.getDirectory();
  },

  async saveAudioFile(fileName, blob) {
    try {
      const root = await this.getRoot();
      const fileHandle = await root.getFileHandle(fileName, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(blob);
      await writable.close();
      return fileName;
    } catch (err) {
      console.error('Gagal menyimpan ke OPFS:', err);
      throw err;
    }
  },

  async getAudioFile(fileName) {
    try {
      const root = await this.getRoot();
      const fileHandle = await root.getFileHandle(fileName);
      return await fileHandle.getFile();
    } catch (err) {
      console.error('Gagal membaca dari OPFS:', err);
      return null;
    }
  },

  async deleteAudioFile(fileName) {
    try {
      const root = await this.getRoot();
      await root.removeEntry(fileName);
    } catch (err) {
      console.warn('Gagal menghapus file OPFS atau file tidak ditemukan:', err);
    }
  }
};

// 3. API Operasional Penyimpanan RekanSuara
export const StorageManager = {
  // Simpan rekaman baru (Audio + Metadata)
  async saveNewRecording({ title, durationSec, audioBlob, transcriptText = '' }) {
    const timestamp = Date.now();
    const opfsKey = `audio_${timestamp}.webm`;

    // Simpan biner ke OPFS
    if (audioBlob) {
      await opfsStorage.saveAudioFile(opfsKey, audioBlob);
    }

    // Simpan entri rekaman ke IndexedDB
    const recordingId = await db.recordings.add({
      title: title || `Rekaman ${new Date().toLocaleString('id-ID')}`,
      createdAt: new Date(),
      duration: durationSec || 0,
      statusAI: 'Menunggu...',
      opfsKey: audioBlob ? opfsKey : null,
      fileSize: audioBlob ? audioBlob.size : 0
    });

    // Simpan transkrip awal jika ada
    if (transcriptText) {
      await db.transcripts.add({
        recordingId,
        text: transcriptText,
        createdAt: new Date()
      });
    }

    return recordingId;
  },

  // Ambil semua daftar rekaman (untuk Dashboard & File Saya)
  async getAllRecordings() {
    return await db.recordings.orderBy('createdAt').reverse().toArray();
  },

  // Hapus rekaman beserta audio biner di OPFS
  async deleteRecording(id) {
    const rec = await db.recordings.get(id);
    if (rec && rec.opfsKey) {
      await opfsStorage.deleteAudioFile(rec.opfsKey);
    }
    await db.transcripts.where({ recordingId: id }).delete();
    await db.recordings.delete(id);
  },

  // Pengaturan Key-Value (API Key, preferensi AI)
  async setSetting(key, val) {
    await db.settings.put({ key, val });
  },

  async getSetting(key) {
    const res = await db.settings.get(key);
    return res ? res.val : null;
  }
};