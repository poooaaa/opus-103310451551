import express from "express";
import path from "path";
import fs from "fs";
import axios from "axios";
import qs from "qs";

// Define a structural interface for tasks
interface DownloadTask {
  id: string;
  youtubeUrl: string;
  title: string;
  filename: string;
  mediaUrl: string;
  resolution: string;
  progress: number;
  downloadedBytes: number;
  totalBytes: number;
  status: "pending" | "downloading" | "completed" | "error";
  error?: string;
  localUrl?: string;
  createdAt: number;
  duration?: string;
  thumbnail?: string;
}

const downloads: Record<string, DownloadTask> = {};

function parseDurationToSeconds(duration: any): number {
  if (duration === null || duration === undefined) return 0;
  
  if (typeof duration === "number") {
    return duration;
  }
  
  const str = String(duration).trim();
  if (!str) return 0;

  // If it's a pure number string, e.g. "360"
  if (/^\d+$/.test(str)) {
    return parseInt(str, 10);
  }

  // If it's in format HH:MM:SS or MM:SS or H:MM:SS etc.
  if (/^(\d+:)?\d+:\d+$/.test(str)) {
    const parts = str.split(":").map(p => parseInt(p, 10));
    if (parts.length === 3) {
      return (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);
    } else if (parts.length === 2) {
      return (parts[0] || 0) * 60 + (parts[1] || 0);
    }
  }

  // Handle formats like "5m 12s", "1h 5m 12s" or simple "5m", "10 min", "10 menit", "1 jam"
  let totalSeconds = 0;
  
  // Extract hours
  const hrMatch = str.match(/(\d+)\s*(h|hr|hour|jam)/i);
  if (hrMatch) {
    totalSeconds += parseInt(hrMatch[1], 10) * 3600;
  }
  
  // Extract minutes
  const minMatch = str.match(/(\d+)\s*(m|min|minute|menit)/i);
  if (minMatch) {
    totalSeconds += parseInt(minMatch[1], 10) * 60;
  }
  
  // Extract seconds
  const secMatch = str.match(/(\d+)\s*(s|sec|second|detik)/i);
  if (secMatch) {
    totalSeconds += parseInt(secMatch[1], 10);
  }

  if (totalSeconds > 0) {
    return totalSeconds;
  }

  return 0;
}

// Ensure downloads directory exists (support writable /tmp in serverless environments like Vercel)
const DOWNLOADS_DIR = process.env.VERCEL
  ? "/tmp"
  : path.join(process.cwd(), "downloads");
if (!fs.existsSync(DOWNLOADS_DIR)) {
  fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
}

// Function to clean up old downloads (older than 30 minutes to conserve disk space)
function cleanOldDownloads() {
  const thirtyMinutes = 30 * 60 * 1000;
  const now = Date.now();
  for (const id in downloads) {
    if (now - downloads[id].createdAt > thirtyMinutes) {
      const task = downloads[id];
      if (task.filename) {
        const filePath = path.join(DOWNLOADS_DIR, task.filename);
        if (fs.existsSync(filePath)) {
          try {
            fs.unlinkSync(filePath);
            console.log(`[Cleanup] Deleted file: ${task.filename}`);
          } catch (e: any) {
            console.error(`[Cleanup] Failed to delete file ${task.filename}:`, e.message);
          }
        }
      }
      delete downloads[id];
      console.log(`[Cleanup] Cleared task ID: ${id}`);
    }
  }
}

// Clean up every 5 minutes
setInterval(cleanOldDownloads, 5 * 60 * 1000);

// YouTube downloader integration function
async function ytdown(url: string) {
  const data = qs.stringify({ url });
  
  const config = {
    method: "POST",
    url: "https://app.ytdown.to/proxy.php",
    headers: {
      "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Mobile Safari/537.36",
      "Accept-Encoding": "gzip, deflate, br, zstd",
      "sec-ch-ua-platform": '"Android"',
      "sec-ch-ua": '"Chromium";v="146", "Not-A.Brand";v="24", "Google Chrome";v="146"',
      "sec-ch-ua-mobile": "?1",
      "x-requested-with": "XMLHttpRequest",
      "dnt": "1",
      "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
      "origin": "https://app.ytdown.to",
      "sec-fetch-site": "same-origin",
      "sec-fetch-mode": "cors",
      "sec-fetch-dest": "empty",
      "referer": "https://app.ytdown.to/id23/",
      "accept-language": "id,en-US;q=0.9,en;q=0.8,ja;q=0.7,zh-CN;q=0.6,zh;q=0.5,ms;q=0.4",
      "priority": "u=1, i"
    },
    data: data
  };
  
  const api = await axios.request(config);
  return api.data;
}

// Parse resolution height from mediaItem
function getResolutionHeight(item: any): number {
  if (item.mediaRes && typeof item.mediaRes === "string") {
    const parts = item.mediaRes.split("x");
    if (parts.length === 2) {
      const h = parseInt(parts[1], 10);
      if (!isNaN(h)) return h;
    }
  }
  
  if (item.mediaUrl && typeof item.mediaUrl === "string") {
    const match = item.mediaUrl.match(/\/(\d+)p$/);
    if (match) {
      const h = parseInt(match[1], 10);
      if (!isNaN(h)) return h;
    }
  }
  
  return 0;
}

// Convert media size string (e.g. "44.69 MB" or "13.53 MB") to number (MB)
function parseSizeToMB(sizeStr: string): number {
  if (!sizeStr) return 0;
  const str = sizeStr.trim().toLowerCase();
  
  const numMatch = str.match(/^([\d.]+)/);
  if (!numMatch) return 0;
  
  const value = parseFloat(numMatch[1]);
  if (isNaN(value)) return 0;
  
  if (str.includes("gb")) {
    return value * 1024;
  }
  if (str.includes("kb")) {
    return value / 1024;
  }
  return value;
}

// Extract the height integer from resolution strings
function parseResolutionHeight(resStr: string): number {
  if (!resStr) return 0;
  const match = resStr.match(/(\d+)p/i);
  if (match) return parseInt(match[1], 10);
  const parts = resStr.split("x");
  if (parts.length === 2) {
    const h = parseInt(parts[1], 10);
    if (!isNaN(h)) return h;
  }
  const digits = resStr.match(/\d+/);
  if (digits) {
    const h = parseInt(digits[0], 10);
    if (!isNaN(h)) return h;
  }
  return 0;
}

export const app = express();

// Trust upstream reverse proxy headers (e.g. Google Cloud Run routing headers)
app.set("trust proxy", true);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

  // Robust Video Range-Streaming Controller for direct HTML5 player on mobile/Safari/Chrome inside iframe
  app.get("/downloads/:filename", (req, res, next) => {
    const filename = req.params.filename;
    if (!filename.endsWith(".mp4")) {
      return next(); // Pass to express.static for other file formats
    }
    
    // Prevent directory traversal
    const safeFilename = path.basename(filename);
    const filePath = path.join(DOWNLOADS_DIR, safeFilename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "Berkas video tidak ditemukan di server (kemungkinan sudah dibersihkan)." });
    }

    // Set necessary streaming, buffer defeat, and CORS headers
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("X-Accel-Buffering", "no"); // Prevent Nginx/Cloud Run buffer blocks
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");

    // Express res.sendFile handles Range requests (HTTP 206) and chunk division perfectly
    res.sendFile(filePath, (err) => {
      if (err) {
        if (res.headersSent) {
          return;
        }
        next(err);
      }
    });
  });

  // Serve downloads statically plain, letting Express stream with complete Byte Range capabilities
  app.use("/downloads", express.static(DOWNLOADS_DIR, {
    setHeaders: (res) => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("X-Accel-Buffering", "no");
    }
  }));

  // API endpoint: Force download of cached files as attachment
  app.get("/api/download-file", (req, res) => {
    const filename = req.query.filename as string;
    if (!filename) {
      return res.status(400).json({ error: "Nama berkas harus ditentukan!" });
    }
    
    // Prevent directory traversal
    const safeFilename = path.basename(filename);
    const filePath = path.join(DOWNLOADS_DIR, safeFilename);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "Berkas tidak ditemukan atau sudah dibersihkan oleh server." });
    }
    
    res.download(filePath, safeFilename);
  });

  // API endpoint: Diagnose downloaded files and task stats
  app.get("/api/diagnose", (req, res) => {
    try {
      const files = fs.readdirSync(DOWNLOADS_DIR);
      const diagnostics = files.map((file) => {
        const filePath = path.join(DOWNLOADS_DIR, file);
        const stats = fs.statSync(filePath);
        
        // Read first 30 bytes to check the file header/magic signature
        let magic = "";
        try {
          const fd = fs.openSync(filePath, "r");
          const buffer = Buffer.alloc(30);
          const bytesRead = fs.readSync(fd, buffer, 0, 30, 0);
          fs.closeSync(fd);
          magic = buffer.subarray(0, bytesRead).toString("hex") + ` (Text: ${buffer.subarray(0, bytesRead).toString("utf8").replace(/[^\x20-\x7E]/g, ".")})`;
        } catch (e: any) {
          magic = "Error reading header: " + e.message;
        }

        return {
          filename: file,
          sizeOnDiskBytes: stats.size,
          sizeOnDiskReadable: `${(stats.size / (1024 * 1024)).toFixed(2)} MB`,
          mtime: stats.mtime,
          magicHeader: magic
        };
      });

      res.json({
        downloadsDir: DOWNLOADS_DIR,
        tasksCount: Object.keys(downloads).length,
        tasks: downloads,
        files: diagnostics
      });
    } catch (err: any) {
      res.status(500).json({ error: "Gagal mendiagnosis: " + err.message });
    }
  });

  // API endpoint: Fetch Youtube video info
  app.post("/api/fetch-info", async (req, res) => {
    try {
      const { url } = req.body;
      if (!url) {
        return res.status(400).json({ error: "URL YouTube harus diisi!" });
      }

      console.log(`[API] Fetching info for URL: ${url}`);
      const rawResult = await ytdown(url);

      if (!rawResult || !rawResult.api || rawResult.api.status !== "ok") {
        return res.status(400).json({ 
          error: "Sistem gagal mengambil detail video. Pastikan URL YouTube yang diberikan valid!" 
        });
      }

      const apiInfo = rawResult.api;
      const durationStr = apiInfo.mediaStats ? apiInfo.mediaStats.duration : "";
      const durationSeconds = parseDurationToSeconds(durationStr);
      if (durationSeconds > 600) {
        return res.status(400).json({ 
          error: `Video ini berdurasi ${durationStr || "lebih dari 10 menit"}. Batas maksimal durasi video yang diperbolehkan saat ini adalah 10 menit!` 
        });
      }

      const mediaItems = apiInfo.mediaItems || [];

      // Filter only video elements
      const videos = mediaItems.filter((item: any) => item.type === "Video");
      if (videos.length === 0) {
        return res.status(400).json({ error: "Tidak ditemukan format video yang bisa diunduh." });
      }

      // Filter other media formats (MP3/Audio)
      const audios = mediaItems.filter((item: any) => item.type === "Audio");

      // Set disabled property to true if format is > 480p and size > 30MB
      const processedVideos = videos.map((v: any) => {
        const height = getResolutionHeight(v);
        const sizeMB = parseSizeToMB(v.mediaFileSize);
        const disabled = height > 480 && sizeMB > 30;
        return {
          ...v,
          height,
          disabled,
          limitReason: disabled ? `Dibatasi: Ukuran (${sizeMB.toFixed(1)}MB) di atas 30MB, kualitas maks 480p` : undefined
        };
      });

      // Deciding the candidates for auto selection (only those that are NOT disabled)
      const activeCandidates = processedVideos.filter((v: any) => !v.disabled);

      // Resolution Selection Engine based strictly on permitted candidates:
      // Preference: 720p (if permitted). Fallback: highest below 720p (480p/360p/etc).
      let selectedOption = activeCandidates.find((v: any) => v.height === 720);
      let matchType = "720p (Sesuai Preferensi)";

      if (!selectedOption) {
        // Sort descending to get the highest format that is less than 720p
        const sub720 = activeCandidates
          .filter((v: any) => v.height < 720)
          .sort((a: any, b: any) => b.height - a.height);

        if (sub720.length > 0) {
          selectedOption = sub720[0];
          matchType = `Menyesuaikan ke resolusi di bawahnya (${selectedOption.height}p) - Batas 30MB`;
        } else {
          // If no permitted videos, pick the lowest of all videos as safety fallback
          const allVideosSorted = processedVideos.sort((a: any, b: any) => a.height - b.height);
          selectedOption = allVideosSorted[0];
          matchType = `Menyesuaikan ke resolusi terendah (${selectedOption.height}p)`;
        }
      }

      res.json({
        title: apiInfo.title,
        description: apiInfo.description,
        thumbnail: apiInfo.imagePreviewUrl || (apiInfo.userInfo ? apiInfo.userInfo.avatar : ""),
        duration: apiInfo.mediaStats ? apiInfo.mediaStats.duration : "Unknown",
        formats: {
          videos: processedVideos,
          audios: audios
        },
        autoSelected: {
          ...selectedOption,
          matchType
        }
      });

    } catch (error: any) {
      console.error("[API Error] Fetch info error:", error.message);
      res.status(500).json({ error: "Terjadi kesalahan internal: " + error.message });
    }
  });

  // API endpoint: Start asynchronous server-side download
  app.post("/api/download-start", async (req, res) => {
    try {
      const { mediaUrl, title, resolution, youtubeUrl } = req.body;
      if (!mediaUrl || !title || !resolution) {
        return res.status(400).json({ error: "Informasi download tidak lengkap!" });
      }

      // Deduplication check: Reuse active or completed download with same URL and resolution
      const normalizedYtUrl = (youtubeUrl || "").trim();
      if (normalizedYtUrl) {
        const existingTask = Object.values(downloads).find(
          (t) =>
            t.youtubeUrl.trim() === normalizedYtUrl &&
            t.resolution === resolution &&
            (t.status === "downloading" || t.status === "pending" || 
             (t.status === "completed" && t.filename && fs.existsSync(path.join(DOWNLOADS_DIR, t.filename))))
        );

        if (existingTask) {
          console.log(`[Deduplication] Menggunakan kembali tugas ${existingTask.id} (Status: ${existingTask.status}) untuk URL: ${normalizedYtUrl}`);
          return res.json({ taskId: existingTask.id });
        }
      }

      const taskId = "dl_" + Math.random().toString(36).substring(2, 10);
      
      // Initialize the metadata task status
      downloads[taskId] = {
        id: taskId,
        youtubeUrl: youtubeUrl || "",
        title,
        filename: "",
        mediaUrl,
        resolution,
        progress: 0,
        downloadedBytes: 0,
        totalBytes: 0,
        status: "pending",
        createdAt: Date.now()
      };

      // Start asynchronous download in background task
      // This protects response blocks from timing out
      setTimeout(() => executeDownloadTask(taskId), 50);

      res.json({ taskId });
    } catch (error: any) {
      res.status(500).json({ error: "Gagal memulai unduhan: " + error.message });
    }
  });

  // API endpoint: Poll download state
  app.get("/api/download-status", (req, res) => {
    const taskId = req.query.id as string;
    if (!taskId || !downloads[taskId]) {
      return res.status(404).json({ error: "Task download tidak ditemukan atau sudah kedaluwarsa!" });
    }
    res.json(downloads[taskId]);
  });

  // API endpoint: Resolve YouTube URL and return direct MP4 preview URL as JSON
  const handleResolveEndpoint = async (req: express.Request, res: express.Response) => {
    const url = (req.query.url || req.body.url) as string;
    if (!url) {
      return res.status(400).json({ status: "error", error: "URL YouTube (url) harus disertakan pada query parameter atau JSON body!" });
    }

    try {
      console.log(`[API Resolve] Memproses URL YouTube: ${url}`);
      
      const normalizedUrl = url.trim();
      // Check if there is already a completed task for this exact YouTube URL
      const existingTask = Object.values(downloads).find(
        (t) =>
          t.youtubeUrl.trim() === normalizedUrl &&
          t.status === "completed" &&
          t.filename &&
          fs.existsSync(path.join(DOWNLOADS_DIR, t.filename))
      );

      if (existingTask) {
        console.log(`[API Resolve Deduplication] Menggunakan kembali berkas cache di tugas ${existingTask.id} untuk URL: ${normalizedUrl}`);
        const host = (req.headers["x-forwarded-host"] as string) || req.get("host");
        const protocol = (req.headers["x-forwarded-proto"] as string) || req.protocol;
        const fullUrl = `${protocol}://${host}${existingTask.localUrl}`;

        return res.json({
          status: "success",
          title: existingTask.title,
          filename: existingTask.filename,
          resolution: existingTask.resolution,
          size_bytes: existingTask.totalBytes,
          url: fullUrl,
          preview_url: fullUrl,
          duration: existingTask.duration || "Unknown",
          thumbnail: existingTask.thumbnail || "",
          matchType: "Cached/Deduplicated (Menghemat Penyimpanan)"
        });
      }

      // 1. Fetch info
      const rawResult = await ytdown(url);
      if (!rawResult || !rawResult.api || rawResult.api.status !== "ok") {
        return res.status(400).json({ 
          status: "error", 
          error: "Gagal mengambil detail video YouTube dari converter server. Pastikan URL valid." 
        });
      }

      const apiInfo = rawResult.api;
      const durationStr = apiInfo.mediaStats ? apiInfo.mediaStats.duration : "";
      const durationSeconds = parseDurationToSeconds(durationStr);
      if (durationSeconds > 600) {
        return res.status(400).json({ 
          status: "error",
          error: `Video ini berdurasi ${durationStr || "lebih dari 10 menit"}. Batas maksimal durasi video yang diperbolehkan saat ini adalah 10 menit!` 
        });
      }

      const mediaItems = apiInfo.mediaItems || [];
      const videos = mediaItems.filter((item: any) => item.type === "Video");
      if (videos.length === 0) {
        return res.status(400).json({ status: "error", error: "Tidak ditemukan format video yang didukung." });
      }

      // Filter out video options > 480p and > 30MB
      const activeResolves = videos.filter((v: any) => {
        const height = getResolutionHeight(v);
        const sizeMB = parseSizeToMB(v.mediaFileSize);
        return !(height > 480 && sizeMB > 30);
      });

      const selectableVideos = activeResolves.length > 0 ? activeResolves : videos;

      // Resolution Selection Engine (Prefer 720p)
      let selectedOption = selectableVideos.find((v: any) => getResolutionHeight(v) === 720);
      let matchType = "720p (Sesuai Preferensi)";

      if (!selectedOption) {
        const sub720 = selectableVideos
          .filter((v: any) => getResolutionHeight(v) < 720)
          .sort((a: any, b: any) => getResolutionHeight(b) - getResolutionHeight(a));

        if (sub720.length > 0) {
          selectedOption = sub720[0];
          matchType = `${getResolutionHeight(selectedOption)}p (Menyesuaikan resolusi bawah) - Batas 30MB`;
        } else {
          const allVideosSorted = selectableVideos.sort((a: any, b: any) => getResolutionHeight(a) - getResolutionHeight(b));
          selectedOption = allVideosSorted[0];
          matchType = `${getResolutionHeight(selectedOption)}p (Resolusi minimal tersedia)`;
        }
      }

      const resolution = `${getResolutionHeight(selectedOption)}p`;
      const mediaUrl = selectedOption.mediaUrl;
      const title = apiInfo.title;

      // 2. Create the download task with stored duration and thumbnail for cache retrieval
      const taskId = "dl_" + Math.random().toString(36).substring(2, 10);
      downloads[taskId] = {
        id: taskId,
        youtubeUrl: url,
        title,
        filename: "",
        mediaUrl,
        resolution,
        progress: 0,
        downloadedBytes: 0,
        totalBytes: 0,
        status: "pending",
        createdAt: Date.now(),
        duration: apiInfo.mediaStats ? apiInfo.mediaStats.duration : "Unknown",
        thumbnail: apiInfo.imagePreviewUrl || (apiInfo.userInfo ? apiInfo.userInfo.avatar : "")
      };

      // 3. Start download task and await completion
      await new Promise<void>((resolve, reject) => {
        executeDownloadTask(taskId).then(() => {
          let checkAttempts = 0;
          const maxCheckAttempts = 180; // 180 * 500ms = 90 seconds (longer timeout for larger/slower videos)
          
          const interval = setInterval(() => {
            checkAttempts++;
            const currentTask = downloads[taskId];
            
            if (!currentTask) {
              clearInterval(interval);
              reject(new Error("Pekerjaan download dibersihkan oleh server sebelum selesai."));
              return;
            }
            
            if (currentTask.status === "completed") {
              clearInterval(interval);
              resolve();
            } else if (currentTask.status === "error") {
              clearInterval(interval);
              reject(new Error(currentTask.error || "Gagal mengunduh file download di server."));
            } else if (checkAttempts >= maxCheckAttempts) {
              clearInterval(interval);
              reject(new Error("Waktu tunggu download selesai di server habis (Timeout 90 detik)."));
            }
          }, 500);
        }).catch((e) => {
          reject(e);
        });
      });

      const finalTask = downloads[taskId];
      if (!finalTask || finalTask.status !== "completed") {
        return res.status(500).json({ status: "error", error: "Proses download gagal atau tidak lengkap." });
      }

      const host = (req.headers["x-forwarded-host"] as string) || req.get("host");
      const protocol = (req.headers["x-forwarded-proto"] as string) || req.protocol;
      const fullUrl = `${protocol}://${host}${finalTask.localUrl}`;

      res.json({
        status: "success",
        title: finalTask.title,
        filename: finalTask.filename,
        resolution: finalTask.resolution,
        size_bytes: finalTask.totalBytes,
        url: fullUrl,
        preview_url: fullUrl,
        duration: apiInfo.mediaStats ? apiInfo.mediaStats.duration : "Unknown",
        thumbnail: apiInfo.imagePreviewUrl || (apiInfo.userInfo ? apiInfo.userInfo.avatar : ""),
        matchType
      });

    } catch (error: any) {
      console.error("[API Resolve Error]:", error.message);
      res.status(500).json({ status: "error", error: error.message });
    }
  };

  app.get("/api/resolve", handleResolveEndpoint);
  app.post("/api/resolve", handleResolveEndpoint);

  // Helper to resolve real file downloadable URL from proxy
  async function resolveRealVideoUrl(mediaUrl: string): Promise<string> {
    let attempts = 0;
    const maxAttempts = 30; // 30 attempts * 2 seconds = 60 seconds max
    
    while (attempts < maxAttempts) {
      attempts++;
      console.log(`[Resolver] Checking media URL: ${mediaUrl} (Attempt ${attempts}/${maxAttempts})`);
      
      const response = await axios({
        method: "GET",
        url: mediaUrl,
        headers: {
          "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Mobile Safari/537.36",
          "Referer": "https://app.ytdown.to/",
          "Origin": "https://app.ytdown.to"
        }
      });

      const contentType = response.headers["content-type"] || "";
      
      // If it is not JSON, it is the direct binary stream! Return the original url
      if (!contentType.toString().includes("application/json")) {
        console.log(`[Resolver] Content is direct binary file stream (Type: ${contentType}).`);
        return mediaUrl;
      }

      const data = response.data;
      console.log(`[Resolver] Received status JSON:`, JSON.stringify(data));

      if (data.status === "completed" || data.percent === "Completed" || data.progress === "Completed") {
        if (data.fileUrl) {
          console.log(`[Resolver] Resolved URL successfully: ${data.fileUrl}`);
          return data.fileUrl;
        } else if (data.viewUrl) {
          console.log(`[Resolver] Resolved URL successfully (viewUrl): ${data.viewUrl}`);
          return data.viewUrl;
        }
      }

      if (data.status === "error" || data.status === "fail") {
        throw new Error(data.message || "Server konversi video melaporkan kesalahan.");
      }

      // If it is preparing, processing or pending, pause and repeat
      console.log(`[Resolver] Server is still compiling/merging the file. Waiting 2 seconds...`);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    throw new Error("Waktu tunggu konversi lewat batas (Timeout). Silakan reload dan coba lagi.");
  }

  // Real Background Downloader function
  async function executeDownloadTask(taskId: string) {
    const task = downloads[taskId];
    if (!task) return;

    task.status = "downloading";
    task.progress = 2; // initial starting progress

    // Sanitize title to make it a safe Unix filename
    const sanitizedTitle = task.title
      .replace(/[^a-zA-Z0-9]/g, "_")
      .replace(/_+/g, "_")
      .substring(0, 60) || "video";
    
    const filename = `${sanitizedTitle}_${task.resolution}_${taskId}.mp4`;
    const filePath = path.join(DOWNLOADS_DIR, filename);
    task.filename = filename;

    console.log(`[Downloader] Task ${taskId} resolving stream from ${task.mediaUrl}`);

    try {
      // 1. Resolve real video download link
      let realDownloadUrl = task.mediaUrl;
      try {
        realDownloadUrl = await resolveRealVideoUrl(task.mediaUrl);
      } catch (resolveErr: any) {
        console.error(`[Downloader] Resolution failed for task ${taskId}:`, resolveErr.message);
        task.status = "error";
        task.error = "Gagal memproses video di server konversi: " + resolveErr.message;
        return;
      }

      // 2. Clear progress indicator / start downloading actual stream
      task.progress = 10;
      console.log(`[Downloader] Task ${taskId} downloading real stream from: ${realDownloadUrl}`);

      const response = await axios({
        method: "GET",
        url: realDownloadUrl,
        responseType: "stream",
        timeout: 120000, // 2 minutes timeout
        headers: {
          "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Mobile Safari/537.36",
          "Referer": "https://app.ytdown.to/",
          "Origin": "https://app.ytdown.to"
        }
      });

      const contentType = response.headers["content-type"] || "";
      if (contentType.toString().includes("text/html") || contentType.toString().includes("application/json")) {
        throw new Error(`Server konversi memberikan respon yang salah (Tipe Konten: ${contentType}). Kemungkinan tautan telah kedaluwarsa atau diblokir. Silakan coba lagi!`);
      }

      const contentLengthHeader = response.headers["content-length"];
      let totalBytes = 0;
      if (typeof contentLengthHeader === "string") {
        totalBytes = parseInt(contentLengthHeader, 10);
      } else if (typeof contentLengthHeader === "number") {
        totalBytes = contentLengthHeader;
      }
      task.totalBytes = totalBytes;

      // 30MB size constraint guard for resolutions higher than 480p
      if (totalBytes > 31457280) { // 30MB in bytes
        const height = parseResolutionHeight(task.resolution);
        if (height > 480) {
          console.error(`[Guard] Blocked task ${taskId} downloading ${task.resolution} because actual size (${totalBytes} bytes) exceeds 30MB.`);
          task.status = "error";
          task.error = `Berkas video asli berukuran ${(totalBytes / (1024 * 1024)).toFixed(1)}MB (melebihi batas 30MB). Kualitas video dengan ukuran di atas 30MB dibatasi maksimal 480p! Silakan pilih kualitas format 480p atau di bawahnya.`;
          return; // Terminate download early before writing to disk
        }
      }

      const writer = fs.createWriteStream(filePath);
      response.data.pipe(writer);

      let downloadedBytes = 0;

      response.data.on("data", (chunk: Buffer) => {
        downloadedBytes += chunk.length;
        task.downloadedBytes = downloadedBytes;
        if (totalBytes > 0) {
          task.progress = Math.round((downloadedBytes / totalBytes) * 100);
        } else {
          // If size is variable/infinite, calculate progress as a pseudo-counter
          task.progress = Math.min(99, Math.round(downloadedBytes / (1024 * 1024))); // MB downloaded
        }
      });

      response.data.on("error", (err: any) => {
        console.error(`[Downloader] Download streaming error on ${taskId}:`, err.message);
        task.status = "error";
        task.error = "Koneksi terputus saat mengunduh dari YouTube: " + err.message;
        writer.end();
        try { fs.unlinkSync(filePath); } catch (_) {}
      });

      writer.on("finish", () => {
        // Double check actual size written on disk
        let sizeOnDisk = 0;
        try {
          sizeOnDisk = fs.statSync(filePath).size;
        } catch (_) {}

        console.log(`[Downloader] Task ${taskId} finish event. totalBytes: ${totalBytes}, downloadedBytes: ${downloadedBytes}, sizeOnDisk: ${sizeOnDisk}`);

        if (totalBytes > 0 && sizeOnDisk < totalBytes) {
          console.error(`[Downloader] Task ${taskId} is incomplete! Only downloaded ${sizeOnDisk} of ${totalBytes} bytes.`);
          task.status = "error";
          task.error = `Koneksi terputus: File tidak lengkap (${sizeOnDisk} dari ${totalBytes} byte terunduh). Silakan jalankan ulang unduhan!`;
          try { fs.unlinkSync(filePath); } catch (_) {}
          return;
        }

        if (sizeOnDisk < 1000) {
          console.error(`[Downloader] Task ${taskId} downloaded file is too small! sizeOnDisk: ${sizeOnDisk}`);
          task.status = "error";
          task.error = "File hasil unduhan rusak/terlalu kecil. Silakan coba lagi!";
          try { fs.unlinkSync(filePath); } catch (_) {}
          return;
        }

        console.log(`[Downloader] Task ${taskId} completed successfully!`);
        task.status = "completed";
        task.progress = 100;
        // In AI Studio environment we can build local relative paths served under standard port
        task.localUrl = `/downloads/${filename}`;
      });

      writer.on("error", (err) => {
        console.error(`[Downloader] Write stream error on ${taskId}:`, err.message);
        task.status = "error";
        task.error = "Gagal menulis file ke penyimpanan server: " + err.message;
        try { fs.unlinkSync(filePath); } catch (_) {}
      });

    } catch (err: any) {
      console.error(`[Downloader] Failed to initialize connection for task ${taskId}:`, err.message);
      task.status = "error";
      task.error = "Gagal menghubungi server video YouTube. Silakan coba lagi. (" + err.message + ")";
      try { fs.unlinkSync(filePath); } catch (_) {}
    }
  }

async function startListener() {
  const PORT = 3000;
  // Vite development vs production router setup
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else if (!process.env.VERCEL) {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // Bind to port 3000 only when not in serverless environments (like Vercel)
  if (!process.env.VERCEL) {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server fully running on http://0.0.0.0:${PORT}`);
    });
  }
}

startListener();
