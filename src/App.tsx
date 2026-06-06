import React, { useState, useEffect } from "react";
import { 
  Youtube, 
  Download, 
  Play, 
  CheckCircle, 
  AlertCircle, 
  Search, 
  Video, 
  Music, 
  Clock, 
  Layers, 
  Loader2, 
  Tv, 
  Copy, 
  RefreshCw, 
  Info,
  Archive,
  ArrowRight,
  Shield,
  CornerDownRight,
  HelpCircle,
  Code,
  Terminal
} from "lucide-react";
import { InfoResponse, DownloadTask, VideoFormat, AudioFormat } from "./types";

export default function App() {
  // Input and General State
  const [youtubeUrl, setYoutubeUrl] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [errorWord, setErrorWord] = useState<string | null>(null);
  const [videoInfo, setVideoInfo] = useState<InfoResponse | null>(null);
  const [copied, setCopied] = useState<boolean>(false);

  // API Developer Playground State
  const [apiTestingUrl, setApiTestingUrl] = useState<string>("https://www.youtube.com/watch?v=aqz-KE-bpKQ");
  const [apiResult, setApiResult] = useState<any | null>(null);
  const [apiLoading, setApiLoading] = useState<boolean>(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [apiCopiedRoute, setApiCopiedRoute] = useState<boolean>(false);

  // Download-polling System States
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [taskProgress, setTaskProgress] = useState<DownloadTask | null>(null);
  
  // History list of downloads completed in this browser session
  const [historyList, setHistoryList] = useState<DownloadTask[]>([]);
  
  // Active selected format (can override autoSelected)
  const [selectedFormat, setSelectedFormat] = useState<VideoFormat | null>(null);

  // Tabs for other formats view
  const [activeFormatTab, setActiveFormatTab] = useState<"video" | "audio">("video");

  // Sample Youtube URL templates so the user can test easily
  const sampleUrls = [
    {
      label: "Bunny Clip (720p default)",
      url: "https://www.youtube.com/watch?v=aqz-KE-bpKQ"
    },
    {
      label: "Sample Short",
      url: "https://youtube.com/shorts/3fG82o6eCDo"
    },
    {
      label: "Classic Lo-Fi Track",
      url: "https://www.youtube.com/watch?v=5qap5aO4i9A"
    }
  ];

  // Quick action: Paste from clipboard
  const handlePasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setYoutubeUrl(text.trim());
      }
    } catch (_) {
      // Clipboard permission might be blocked inside iframe, ignore gracefully
    }
  };

  // Trigger video details parsing on the server
  const handleFetchDetails = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!youtubeUrl.trim()) {
      setErrorWord("Silakan masukkan URL video YouTube terlebih dahulu!");
      return;
    }

    setLoading(true);
    setErrorWord(null);
    setVideoInfo(null);
    setSelectedFormat(null);
    setTaskProgress(null);
    setActiveTaskId(null);

    try {
      const response = await fetch("/api/fetch-info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: youtubeUrl.trim() })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Gagal menghubungi server");
      }

      setVideoInfo(data);
      // Default to the server's autoSelected format
      setSelectedFormat(data.autoSelected);
    } catch (err: any) {
      console.error(err);
      setErrorWord(err.message || "Terjadi kesalahan koneksi ke server, coba lagi.");
    } finally {
      setLoading(false);
    }
  };

  // Preset button trigger
  const handleLoadSample = (url: string) => {
    setYoutubeUrl(url);
    // Directly submit after updating url state, adding micro delays to avoid race conditions
    setTimeout(() => {
      setLoading(true);
      setErrorWord(null);
      setVideoInfo(null);
      setSelectedFormat(null);
      setTaskProgress(null);
      setActiveTaskId(null);
      
      fetch("/api/fetch-info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url })
      })
        .then(res => res.json().then(data => ({ ok: res.ok, data })))
        .then(({ ok, data }) => {
          if (!ok) throw new Error(data.error || "Gagal memproses URL");
          setVideoInfo(data);
          setSelectedFormat(data.autoSelected);
        })
        .catch(err => {
          setErrorWord(err.message || "Gagal memuat URL contoh");
        })
        .finally(() => {
          setLoading(false);
        });
    }, 100);
  };

  // Launch the Server-Side cache downloader
  const handleStartDownload = async (formatOverride?: VideoFormat) => {
    const targetFormat = formatOverride || selectedFormat;
    if (!videoInfo || !targetFormat) return;

    setErrorWord(null);
    // Initialize standard progress state and set task as active
    setTaskProgress({
      id: "pending",
      youtubeUrl: youtubeUrl,
      title: videoInfo.title,
      filename: "",
      mediaUrl: targetFormat.mediaUrl,
      resolution: targetFormat.mediaRes || `${targetFormat.height}p` || "Unknown",
      progress: 0,
      downloadedBytes: 0,
      totalBytes: 0,
      status: "pending",
      createdAt: Date.now()
    });

    try {
      const response = await fetch("/api/download-start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mediaUrl: targetFormat.mediaUrl,
          title: videoInfo.title,
          resolution: targetFormat.mediaRes || `${targetFormat.height}p` || "Unknown",
          youtubeUrl: youtubeUrl
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Gagal mengawasi unduhan di server");
      }

      // Store active task id to trigger useEffect polling loop
      setActiveTaskId(data.taskId);
    } catch (err: any) {
      console.error(err);
      setErrorWord(err.message || "Gagal memproses download.");
      setTaskProgress(null);
    }
  };

  // Poller loop for watching the server task status
  useEffect(() => {
    if (!activeTaskId) return;

    let isMounted = true;
    let timerId: NodeJS.Timeout;

    const checkStatus = async () => {
      try {
        const response = await fetch(`/api/download-status?id=${activeTaskId}`);
        if (!response.ok) {
          throw new Error("Gagal mengambil info status dari server.");
        }
        const data: DownloadTask = await response.json();
        
        if (isMounted) {
          setTaskProgress(data);
          
          if (data.status === "completed") {
            setActiveTaskId(null);
            // Append successfully generated download task to browser session registry history list
            setHistoryList(prev => {
              // Ensure we don't insert duplicate IDs
              if (prev.some(h => h.id === data.id)) return prev;
              return [data, ...prev];
            });
          } else if (data.status === "error") {
            setActiveTaskId(null);
            setErrorWord(data.error || "Proses unduhan server terputus.");
          }
        }
      } catch (err: any) {
        console.error("Polling error:", err);
        if (isMounted) {
          setErrorWord("Gagal memantau unduhan: " + err.message);
          setActiveTaskId(null);
        }
      }
    };

    // Execute right away, and set repeated timer check
    checkStatus();
    timerId = setInterval(checkStatus, 1000);

    return () => {
      isMounted = false;
      clearInterval(timerId);
    };
  }, [activeTaskId]);

  // Helper formatting for file size display
  const renderSize = (bytes: number): string => {
    if (!bytes || bytes <= 0) return "Calculating...";
    const mbs = bytes / (1024 * 1024);
    return `${mbs.toFixed(2)} MB`;
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-red-500 selection:text-white pb-16">
      
      {/* Decorative colored glow overlays for premium cosmic atmosphere */}
      <div className="absolute top-0 left-1/4 w-[40rem] h-[40rem] bg-red-600/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute top-1/3 right-1/4 w-[35rem] h-[35rem] bg-indigo-600/10 rounded-full blur-[120px] pointer-events-none" />

      {/* Main Grid Wrapper Layout */}
      <div className="w-full max-w-6xl mx-auto px-4 pt-12 relative z-10">
        
        {/* Top Header branding section */}
        <header className="text-center mb-10" id="header_section">
          <div className="inline-flex items-center gap-3 bg-red-500/10 border border-red-500/20 px-4 py-1.5 rounded-full text-red-500 text-sm font-medium mb-4 backdrop-blur-md">
            <Youtube className="w-4 h-4 fill-current" />
            <span>YouTube Downloader & Converter Engine</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-white mb-3">
            YouTube Video <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-500 to-rose-400">720p Auto Downloader</span>
          </h1>
          <p className="text-slate-400 text-md max-w-xl mx-auto leading-relaxed">
            Sistem pengunduhan pintar! Otomatis memilih kualitas <strong className="text-red-400">720p HD</strong> atau secara dinamis menyesuaikan ke format di bawahnya (<strong className="text-slate-300">480p / 360p</strong>) jika resolusi utama tidak tersedia.
          </p>
        </header>

        {/* Input box card section */}
        <section className="bg-slate-900/60 border border-slate-800/80 backdrop-blur-xl rounded-2xl p-6 md:p-8 shadow-2xl mb-8" id="search_card">
          <form onSubmit={handleFetchDetails} className="space-y-4">
            <label htmlFor="youtube-input" className="block text-sm font-medium text-slate-300 mb-1">
              Tempel URL Video YouTube:
            </label>
            <div className="flex flex-col md:flex-row gap-3">
              <div className="relative flex-1">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                  <Youtube className="w-5 h-5" />
                </div>
                <input
                  id="youtube-input"
                  type="text"
                  placeholder="https://www.youtube.com/watch?v=... atau https://youtu.be/..."
                  value={youtubeUrl}
                  onChange={(e) => setYoutubeUrl(e.target.value)}
                  className="block w-full pl-11 pr-32 py-3.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-550 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all sm:text-sm shadow-inner"
                  required
                />
                
                {/* Micro utility buttons inside the input frame */}
                <div className="absolute inset-y-1.5 right-1.5 flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handlePasteFromClipboard}
                    title="Tempel dari Clipboard"
                    className="p-2 text-xs bg-slate-900 border border-slate-800 rounded-lg text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
                  >
                    Paste
                  </button>
                  {youtubeUrl && (
                    <button
                      type="button"
                      onClick={() => setYoutubeUrl("")}
                      className="px-2 text-xs text-slate-500 hover:text-red-400 transition-colors"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>
              
              <button
                type="submit"
                disabled={loading}
                className="inline-flex items-center justify-center px-6 py-3.5 bg-red-600 hover:bg-red-700 disabled:bg-slate-800 text-white font-semibold rounded-xl transition-all shadow-lg shadow-red-650/15 disabled:cursor-not-allowed group gap-2.5 active:scale-95"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin text-slate-300" />
                    <span>Menganalisis...</span>
                  </>
                ) : (
                  <>
                    <Search className="w-5 h-5 group-hover:scale-110 transition-transform" />
                    <span>Analisis Tautan</span>
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Quick Preset Buttons for easy developer or user testing */}
          <div className="mt-5 border-t border-slate-800/60 pt-4">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <span className="text-xs text-slate-400 font-medium flex items-center gap-1">
                <HelpCircle className="w-3.5 h-3.5 text-slate-500" />
                Coba URL Contoh:
              </span>
              <div className="flex flex-wrap gap-2">
                {sampleUrls.map((preset, index) => (
                  <button
                    key={index}
                    type="button"
                    onClick={() => handleLoadSample(preset.url)}
                    className="px-3 py-1 text-xs bg-slate-950/80 border border-slate-800 rounded-full text-slate-300 hover:border-red-500/50 hover:text-red-400 transition-all font-medium hover:bg-red-500/5"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Error Notification Block */}
        {errorWord && (
          <div className="bg-red-950/60 border border-red-900/50 rounded-xl p-4 mb-8 flex gap-3.5 items-start text-red-300 shadow-md backdrop-blur-md animate-in fade-in slide-in-from-top-3 duration-300" id="error_banner">
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div className="space-y-1 flex-1">
              <h4 className="font-semibold text-white">Gagal Memproses Permintaan</h4>
              <p className="text-sm text-red-300/90 leading-relaxed">{errorWord}</p>
            </div>
            <button 
              onClick={() => setErrorWord(null)} 
              className="text-red-400 hover:text-red-200 text-xs font-semibold px-2 py-1 rounded"
            >
              Tutup
            </button>
          </div>
        )}

        {/* Main interactive media deck panels when info is loaded */}
        {videoInfo && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mb-8" id="analysis_result_deck">
            
            {/* Left side card: Visual Frame & embedded MP4 Player */}
            <div className="lg:col-span-5 space-y-6">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl" id="media_playback_container">
                <div className="p-3 bg-slate-900/50 border-b border-slate-800/80 flex items-center justify-between">
                  <span className="text-xs text-slate-400 font-mono font-medium flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-red-550 animate-pulse" />
                    Live Preview & Player
                  </span>
                  
                  {taskProgress && taskProgress.status === "completed" && (
                    <span className="px-2.5 py-0.5 text-[10px] bg-green-500/10 border border-green-500/20 text-green-400 rounded-full font-semibold font-mono animate-bounce">
                      SERVER READY
                    </span>
                  )}
                </div>

                <div className="relative aspect-video bg-slate-950 flex items-center justify-center overflow-hidden">
                  
                  {/* If server-side MP4 cache download is complete, render the direct HTML5 video player */}
                  {taskProgress && taskProgress.status === "completed" && taskProgress.localUrl ? (
                    <video
                      src={taskProgress.localUrl}
                      controls
                      playsInline
                      poster={videoInfo.thumbnail}
                      className="w-full h-full object-contain bg-black"
                    />
                  ) : (
                    <>
                      {/* Otherwise display the original YouTube cover thumbnail */}
                      <img
                        src={videoInfo.thumbnail}
                        alt={videoInfo.title}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover opacity-80"
                      />
                      <div className="absolute inset-0 bg-slate-950/45 flex flex-col items-center justify-center p-4">
                        
                        {/* Display indicator overlays for during active download blocks */}
                        {taskProgress ? (
                          <div className="w-full max-w-xs px-4 text-center space-y-2.5">
                            {taskProgress.status === "downloading" ? (
                              <>
                                <div className="inline-flex p-3 bg-red-650/15 rounded-full text-red-500 animate-spin mb-1">
                                  <Loader2 className="w-6 h-6 animate-spin" />
                                </div>
                                <h5 className="text-sm font-semibold text-white">Sedang Memproses Ke Server...</h5>
                              </>
                            ) : taskProgress.status === "pending" ? (
                              <>
                                <div className="inline-flex p-3 bg-indigo-500/15 rounded-full text-indigo-400 animate-pulse mb-1">
                                  <Loader2 className="w-6 h-6 animate-spin" />
                                </div>
                                <h5 className="text-sm font-semibold text-indigo-300">Menjadwalkan Unduhan...</h5>
                              </>
                            ) : taskProgress.status === "error" ? (
                              <>
                                <div className="inline-flex p-3 bg-red-950 border border-red-905 rounded-full text-red-500 mb-1">
                                  <AlertCircle className="w-6 h-6" />
                                </div>
                                <h5 className="text-sm font-semibold text-red-400">Unduhan Server Gagal</h5>
                              </>
                            ) : null}

                            {/* Standard percentage meter */}
                            <div className="relative w-full h-2.5 bg-slate-800 rounded-full overflow-hidden border border-slate-750">
                              <div
                                className={`absolute inset-y-0 left-0 transition-all duration-300 rounded-full ${
                                  taskProgress.status === "error" ? "bg-red-550" : "bg-gradient-to-r from-red-650 to-rose-455"
                                }`}
                                style={{ width: `${taskProgress.progress >= 0 ? taskProgress.progress : 50}%` }}
                              />
                            </div>
                            
                            <div className="flex justify-between items-center text-[11px] text-slate-400 font-mono">
                              <span>
                                {taskProgress.progress >= 0 ? `${taskProgress.progress}%` : "Membaca data..."}
                              </span>
                              <span>
                                {taskProgress.downloadedBytes > 0 
                                  ? `${renderSize(taskProgress.downloadedBytes)} / ${renderSize(taskProgress.totalBytes)}` 
                                  : "Memulai Unduhan"}
                              </span>
                            </div>
                          </div>
                        ) : (
                          // Default Play overlay prior to download trigger
                          <button
                            onClick={() => handleStartDownload()}
                            className="bg-red-600 hover:bg-red-500 text-white p-4.5 rounded-full shadow-2xl hover:scale-110 active:scale-95 transition-all text-center flex items-center justify-center"
                            title="Unduh dan muat video"
                          >
                            <Play className="w-8 h-8 fill-current translate-x-0.5" />
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>

                {/* Cover file summaries statistics bar */}
                <div className="p-4 bg-slate-900/80 border-t border-slate-850 space-y-3.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400 font-medium">Resolusi Terpilih:</span>
                    <span className="text-white font-semibold flex items-center gap-1 font-mono">
                      <Layers className="w-3.5 h-3.5 text-red-400" />
                      {selectedFormat ? `${selectedFormat.mediaRes || selectedFormat.height + "p"}` : "Unspecified"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400 font-medium">Prediksi Ukuran File:</span>
                    <span className="text-red-400 font-bold font-mono">
                      {selectedFormat?.mediaFileSize || "Unknown Size"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400 font-medium">Format File:</span>
                    <span className="px-2 py-0.5 bg-slate-950 border border-slate-800 font-semibold rounded text-[10px] text-slate-300 font-mono">
                      {selectedFormat?.mediaExtension || "MP4"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Secure host warning tag */}
              <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-4 flex gap-3 items-start text-xs text-slate-400">
                <Shield className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                <p className="leading-relaxed">
                  Semua video diunduh secara penuh dan aman oleh server kami. File MP4 yang disajikan dijalankan secara langsung dari URL lokal tanpa iklan, skrip pop up eksternal, atau ancaman malware pihak ketiga.
                </p>
              </div>
            </div>

            {/* Right side: Video Title, Auto Resolution Details, and direct download buttons */}
            <div className="lg:col-span-7 space-y-6">
              
              {/* Main title deck */}
              <div className="space-y-2">
                <span className="text-xs text-red-500 font-bold tracking-wider uppercase font-mono">
                  INFO DETAIL VIDEO
                </span>
                <h2 className="text-2xl font-bold text-white leading-snug">
                  {videoInfo.title}
                </h2>
                
                <div className="flex flex-wrap gap-4 items-center text-sm text-slate-400 pt-1.5">
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-slate-500" />
                    <span className="font-medium">Durasi: {videoInfo.duration}</span>
                  </div>
                  <div className="w-1.5 h-1.5 rounded-full bg-slate-800" />
                  <span className="text-xs py-0.5 px-2.5 bg-red-500/10 border border-red-500/10 text-red-400 font-semibold rounded-full font-mono">
                    Auto-selected: {videoInfo.autoSelected.mediaRes || `${videoInfo.autoSelected.height}p`}
                  </span>
                </div>
              </div>

              {/* Decision Box: Explaining 720p algorithm selection choices */}
              <div className="bg-gradient-to-br from-slate-900 to-slate-900/40 border border-red-500/20 rounded-xl p-5 relative overflow-hidden" id="resolution_logic_banner">
                <div className="absolute top-0 right-0 w-32 h-32 bg-red-600/5 rounded-full blur-2xl pointer-events-none" />
                
                <div className="flex items-start gap-3.5">
                  <div className="p-2 bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg shrink-0">
                    <Layers className="w-5 h-5" />
                  </div>
                  <div className="space-y-1.5 flex-1">
                    <h4 className="font-bold text-white text-sm flex items-center gap-2">
                      Keputusan Mesin Resolusi
                      <span className="text-[10px] px-2 py-0.5 bg-green-500/15 border border-green-500/20 text-green-400 rounded font-mono uppercase">
                        Active
                      </span>
                    </h4>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      Sistem mendeteksi format video dan memilih:{" "}
                      <strong className="text-red-400">{videoInfo.autoSelected.matchType}</strong>.
                    </p>
                    <div className="text-[11px] text-slate-400 flex items-center gap-1 pt-1 font-mono">
                      <CornerDownRight className="w-3.5 h-3.5 text-red-500 shrink-0" />
                      URL Media: {videoInfo.autoSelected.mediaUrl.substring(0, 48)}...
                    </div>
                  </div>
                </div>
              </div>

              {/* Interactive Downloader buttons and polling status display */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6" id="download_panel">
                <div className="space-y-4">
                  <h3 className="font-bold text-white text-md">
                    Langkah Unduhan
                  </h3>

                  {/* Condition A: No active download task yet */}
                  {!taskProgress && (
                    <button
                      onClick={() => handleStartDownload()}
                      className="w-full flex items-center justify-center gap-2.5 px-6 py-4 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl shadow-lg shadow-red-700/10 transition-all text-center hover:scale-[1.01] active:scale-[0.99]"
                    >
                      <Download className="w-5 h-5 animate-pulse" />
                      <span>Unduh Video Secara Otomatis ({videoInfo.autoSelected.mediaRes || `${videoInfo.autoSelected.height}p`})</span>
                    </button>
                  )}

                  {/* Condition B: Active download loading or progress status in effect */}
                  {taskProgress && taskProgress.status !== "completed" && taskProgress.status !== "error" && (
                    <div className="space-y-3 p-4 bg-slate-950 border border-slate-800 rounded-xl relative">
                      
                      <div className="flex items-center gap-3">
                        <Loader2 className="w-5 h-5 animate-spin text-red-550 shrink-0" />
                        <div className="flex-1">
                          <h5 className="text-sm font-semibold text-white">
                            {taskProgress.status === "pending" ? "Menjadwalkan Antrean Unduhan..." : "Proses Mengunduh Ke Server..."}
                          </h5>
                          <p className="text-xs text-slate-400 leading-relaxed mt-0.5">
                            Melakukan caching video file dari YouTube menuju server internal file-storage. Mohon tidak menutup halaman ini.
                          </p>
                        </div>
                      </div>

                      {/* Explicit percentage meter */}
                      <div className="space-y-1.5 pt-2">
                        <div className="flex justify-between items-center text-xs font-mono text-slate-400">
                          <span>Progress: {taskProgress.progress >= 0 ? `${taskProgress.progress}%` : "Inisialisasi..."}</span>
                          <span>{renderSize(taskProgress.downloadedBytes)} / {renderSize(taskProgress.totalBytes)}</span>
                        </div>
                        <div className="w-full h-2 bg-slate-850 rounded-full overflow-hidden border border-slate-800">
                          <div
                            className="h-full bg-gradient-to-r from-red-600 to-rose-455 transition-all duration-300 rounded-full"
                            style={{ width: `${taskProgress.progress >= 0 ? taskProgress.progress : 15}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Condition C: Cache completed successfully. Output the local static download URL */}
                  {taskProgress && taskProgress.status === "completed" && taskProgress.localUrl && (
                    <div className="space-y-4 p-5 bg-emerald-950/20 border border-emerald-500/20 rounded-xl animate-in zoom-in-95 duration-300">
                      <div className="flex gap-3 items-start text-emerald-400">
                        <CheckCircle className="w-6 h-6 shrink-0 mt-0.5 text-emerald-500" />
                        <div className="space-y-1 flex-1">
                          <h5 className="font-extrabold text-white text-md">
                            Selesai! Video Berhasil Diunduh
                          </h5>
                          <p className="text-sm text-slate-300 leading-relaxed">
                            Video beresolusi <strong className="text-amber-400">{taskProgress.resolution}</strong> telah disimpan dengan sukses di server local kami. File MP4 siap diputar atau disimpan ke perangkat Anda!
                          </p>
                        </div>
                      </div>

                      {/* Large download file link */}
                      <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
                        <a
                          href={`/api/download-file?filename=${encodeURIComponent(taskProgress.filename)}`}
                          className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl shadow-lg transition-all text-center text-sm"
                        >
                          <Download className="w-4.5 h-4.5" />
                          <span>Download File MP4 Ke Perangkat</span>
                        </a>
                        
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(window.location.origin + (taskProgress.localUrl || ""));
                            setCopied(true);
                            setTimeout(() => setCopied(false), 2000);
                          }}
                          className="px-4 py-3.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl text-sm transition-all flex items-center justify-center gap-1.5 font-medium"
                          title="Salin Tautan MP4"
                        >
                          <Copy className="w-4 h-4" />
                          <span>{copied ? "Tersalin!" : "Salin Tautan"}</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Advanced Toggle Formats to let users override selected formats */}
                  {selectedFormat && (
                    <div className="pt-2 border-t border-slate-800">
                      <p className="text-[11px] text-slate-400 flex items-center gap-1.5 pb-2">
                        <Info className="w-3.5 h-3.5 text-indigo-400" />
                        Format yang aktif saat ini: <strong className="text-red-400">{selectedFormat.mediaRes || `${selectedFormat.height}p`}</strong> ({selectedFormat.mediaFileSize || "Tanpa data ukuran"}).
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Collapsible Format explorer (Videos & Audios) */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden" id="formats_explorer">
                <div className="p-4 bg-slate-900/50 border-b border-slate-850 flex items-center justify-between">
                  <h4 className="font-bold text-white text-sm">
                    Eksplor Format Lainnya
                  </h4>
                  <div className="flex p-0.5 bg-slate-950 rounded-lg border border-slate-850">
                    <button
                      onClick={() => setActiveFormatTab("video")}
                      className={`px-3 py-1 text-xs rounded-md font-semibold transition-all flex items-center gap-1 ${
                        activeFormatTab === "video" 
                          ? "bg-red-600/10 border border-red-500/20 text-red-400" 
                          : "text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      <Video className="w-3.5 h-3.5" />
                      Video ({videoInfo.formats.videos.length})
                    </button>
                    <button
                      onClick={() => setActiveFormatTab("audio")}
                      className={`px-3 py-1 text-xs rounded-md font-semibold transition-all flex items-center gap-1 ${
                        activeFormatTab === "audio" 
                          ? "bg-red-600/10 border border-red-500/20 text-red-400" 
                          : "text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      <Music className="w-3.5 h-3.5" />
                      Audio ({videoInfo.formats.audios.length})
                    </button>
                  </div>
                </div>

                <div className="p-4 max-h-[15rem] overflow-y-auto divide-y divide-slate-850 custom-scrollbar">
                  
                  {activeFormatTab === "video" ? (
                    videoInfo.formats.videos.length > 0 ? (
                      videoInfo.formats.videos.map((format, index) => {
                        const isAuto = videoInfo.autoSelected.mediaId === format.mediaId;
                        const isActive = selectedFormat?.mediaId === format.mediaId;
                        return (
                          <div 
                            key={index} 
                            className={`py-3.5 flex items-center justify-between gap-4 first:pt-0 last:pb-0 transition-colors ${
                              isActive ? "text-white" : "text-slate-300"
                            }`}
                          >
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="font-extrabold text-sm font-mono text-white">
                                  {format.mediaRes || `${format.height}p`}
                                </span>
                                {isAuto && (
                                  <span className="px-1.5 py-0.2 bg-red-600/10 border border-red-500/20 text-red-400 text-[9px] font-bold tracking-wide rounded">
                                    AUTO 720P PREFERENCE
                                  </span>
                                )}
                                {format.mediaQuality && (
                                  <span className="text-[10px] font-semibold text-slate-500 bg-slate-950 border border-slate-850 px-1.5 py-0.2 rounded font-mono">
                                    {format.mediaQuality}
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-slate-400 flex items-center gap-1.5 font-mono">
                                <span>Ukuran: {format.mediaFileSize || "Tidak tersedia"}</span>
                                <span className="text-slate-700">•</span>
                                <span>Tipe: {format.mediaExtension}</span>
                              </p>
                            </div>

                            <div className="flex items-center gap-1.5">
                              {isActive ? (
                                <button
                                  type="button"
                                  onClick={() => handleStartDownload(format)}
                                  className="px-3.5 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1.5"
                                >
                                  <Download className="w-3.5 h-3.5" />
                                  Unduh Format
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedFormat(format);
                                    // Soft scroll reset to view information details nicely
                                  }}
                                  className="px-3.5 py-1.5 bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800 rounded-lg text-xs font-semibold transition-all"
                                >
                                  Pilih Format
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <p className="text-center py-6 text-xs text-slate-400">Tidak ada format video yang terdeteksi.</p>
                    )
                  ) : (
                    videoInfo.formats.audios.length > 0 ? (
                      videoInfo.formats.audios.map((format, index) => {
                        return (
                          <div 
                            key={index} 
                            className="py-3.5 flex items-center justify-between gap-4 first:pt-0 last:pb-0 text-slate-300 hover:bg-slate-900/10 rounded px-1 transition-colors"
                          >
                            <div className="space-y-1">
                              <div className="flex items-center gap-1.5">
                                <span className="font-extrabold text-sm font-mono text-white">
                                  {format.mediaQuality || "128K"}
                                </span>
                                <span className="px-1.5 py-0.2 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-[9px] font-bold rounded">
                                  AUDIO
                                </span>
                              </div>
                              <p className="text-xs text-slate-400 flex items-center gap-1.5 font-mono">
                                <span>Ukuran: {format.mediaFileSize || "Tidak tersedia"}</span>
                                <span className="text-slate-600">•</span>
                                <span>Ekstensi: {format.mediaExtension}</span>
                              </p>
                            </div>

                            {/* Direct downloader for alternative audios */}
                            <a
                              href={format.mediaUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="px-3 py-1.5 bg-slate-950 border border-slate-800 hover:bg-slate-850 text-slate-300 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                            >
                              <Download className="w-3.5 h-3.5 text-red-500" />
                              Unduh Audio (Direct)
                            </a>
                          </div>
                        );
                      })
                    ) : (
                      <p className="text-center py-6 text-xs text-slate-400">Tidak ada format audio yang terdeteksi.</p>
                    )
                  )}

                </div>
              </div>

            </div>

          </div>
        )}

        {/* History Ledger section (Shows recently processed cache works) */}
        {historyList.length > 0 && (
          <section className="bg-slate-900/40 border border-slate-800 rounded-2xl p-6 shadow-xl" id="history_ledger">
            <div className="flex items-center gap-2 mb-4">
              <Archive className="w-5 h-5 text-red-500" />
              <h3 className="font-bold text-white text-md">
                Riwayat Caching Browser Anda ({historyList.length})
              </h3>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {historyList.map((item, index) => (
                <div 
                  key={index}
                  className="p-4 bg-slate-950/70 border border-slate-850 rounded-xl relative overflow-hidden flex flex-col justify-between gap-3 group hover:border-red-500/30 transition-all duration-300"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] px-2 py-0.5 bg-slate-900 border border-slate-800 text-slate-400 font-mono rounded font-bold">
                        {item.resolution}
                      </span>
                      <span className="text-[10px] text-slate-500 font-mono">
                        {new Date(item.createdAt).toLocaleTimeString()}
                      </span>
                    </div>

                    <h4 className="text-sm font-bold text-white line-clamp-1 group-hover:text-red-400 transition-colors">
                      {item.title}
                    </h4>
                  </div>

                  <div className="flex items-center justify-between gap-3 pt-2 border-t border-slate-900/80">
                    <span className="text-xs text-slate-450 font-mono">
                      Size: {renderSize(item.totalBytes)}
                    </span>
                    <div className="flex gap-1.5">
                      {/* Let user load the history download back onto the preview element */}
                      <button
                        onClick={() => {
                          setVideoInfo({
                            title: item.title,
                            description: "",
                            thumbnail: "https://i.ytimg.com/vi/" + (item.youtubeUrl.includes("v=") ? item.youtubeUrl.split("v=")[1].split("&")[0] : "aqz-KE-bpKQ") + "/sddefault.jpg",
                            duration: "",
                            formats: { videos: [], audios: [] },
                            autoSelected: {
                              type: "Video",
                              name: "Media",
                              mediaId: item.id,
                              mediaUrl: item.mediaUrl,
                              mediaPreviewUrl: item.mediaUrl,
                              mediaThumbnail: "",
                              mediaRes: item.resolution,
                              mediaQuality: "HD",
                              mediaDuration: "",
                              mediaExtension: "MP4",
                              mediaFileSize: renderSize(item.totalBytes),
                              mediaTask: "merge"
                            }
                          });
                          setSelectedFormat({
                            type: "Video",
                            name: "Media",
                            mediaId: item.id,
                            mediaUrl: item.mediaUrl,
                            mediaPreviewUrl: item.mediaUrl,
                            mediaThumbnail: "",
                            mediaRes: item.resolution,
                            mediaQuality: "HD",
                            mediaDuration: "",
                            mediaExtension: "MP4",
                            mediaFileSize: renderSize(item.totalBytes),
                            mediaTask: "merge"
                          });
                          setTaskProgress(item);
                        }}
                        className="px-2.5 py-1.5 bg-slate-900 text-slate-300 hover:text-white rounded-lg text-xs font-semibold hover:bg-slate-800 transition-all flex items-center gap-1"
                        title="Mainkan kembali di panel preview"
                      >
                        <Play className="w-3 h-3 fill-current" />
                        <span>Play</span>
                      </button>

                      {/* Direct safe URL attachment link */}
                      <a
                        href={`/api/download-file?filename=${encodeURIComponent(item.filename)}`}
                        className="px-2.5 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1"
                      >
                        <Download className="w-3 h-3" />
                        <span>Download</span>
                      </a>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Informative Step Guides (Fulfills visual hierarchy guidelines perfectly without tech bloat) */}
        <section className="mt-12 bg-slate-900/35 border border-slate-800/60 rounded-2xl p-6 md:p-8" id="guide_slate">
          <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
            <Info className="w-5 h-5 text-red-500 animate-pulse" />
            Panduan & Cara Kerja Sistem Otomatis
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <div className="w-7 h-7 rounded-lg bg-red-500/10 text-red-400 font-bold flex items-center justify-center text-sm font-mono border border-red-500/20">
                1
              </div>
              <h4 className="font-extrabold text-sm text-white">Analisis Resolusi</h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                Platform menterjemahkan video YouTube dan mencari berkas kualitas <strong className="text-slate-300">720p HD</strong>. Jika tidak ditemukan, sistem otomatis beralih ke <strong className="text-slate-300">480p</strong> atau <strong className="text-slate-300">360p</strong>.
              </p>
            </div>
            
            <div className="space-y-2">
              <div className="w-7 h-7 rounded-lg bg-red-500/10 text-red-400 font-bold flex items-center justify-center text-sm font-mono border border-red-500/20">
                2
              </div>
              <h4 className="font-extrabold text-sm text-white">Mengunduh ke Server</h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                Setelah konfirmasi pengguna, server internal AI di Cloud bekerja secara penuh mengunduh raw video dari YouTube CDN untuk menghindari masalah limit konektor browser.
              </p>
            </div>

            <div className="space-y-2">
              <div className="w-7 h-7 rounded-lg bg-red-500/10 text-red-400 font-bold flex items-center justify-center text-sm font-mono border border-red-500/20">
                3
              </div>
              <h4 className="font-extrabold text-sm text-white">Muat & Download</h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                Video MP4 yang disimpan server kini dapat dimuat langsung di peramban web kita (built-in HTML5 preview) atau diunduh penuh dengan sekali klik dengan kecepatan maksimal!
              </p>
            </div>
          </div>
        </section>

        {/* Developer API Setup & Blueprint Sandbox */}
        <section className="mt-12 bg-slate-900/35 border border-slate-800/60 rounded-2xl p-6 md:p-8" id="api_developer_sandbox">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 border-b border-slate-850 pb-5">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-red-600/10 rounded-xl border border-red-500/10">
                <Code className="w-5 h-5 text-red-500" />
              </div>
              <div>
                <h3 className="text-md font-bold text-white">Sistem Integrasi API Developer</h3>
                <p className="text-xs text-slate-400 mt-0.5">Integrasikan MP4 Downloader ke bot, skrip otomatisasi, atau aplikasi eksternal.</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 self-start sm:self-center">
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-500/10 text-emerald-400 text-[10px] font-mono border border-emerald-500/20 font-bold">
                ● LIVE
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 text-slate-350 text-[10px] font-mono border border-slate-700 font-bold">
                API v1
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Documentation column */}
            <div className="lg:col-span-5 space-y-5">
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Spesifikasi Endpoint</h4>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Kirim parameter query atau JSON body berisi url video YouTube, dan server akan memproses konversi lalu membalas dengan JSON berisi detail video & tautan streaming MP4 langsung.
                </p>
              </div>

              {/* Endpoint card */}
              <div className="p-4 bg-slate-950/75 border border-slate-850 rounded-xl space-y-3">
                <div className="flex items-center justify-between gap-2.5">
                  <div className="flex items-center gap-2">
                    <span className="px-1.5 py-0.5 bg-sky-500/10 text-sky-400 text-[10px] font-mono font-extrabold rounded border border-sky-500/20">
                      GET
                    </span>
                    <span className="px-1.5 py-0.5 bg-violet-500/10 text-violet-400 text-[10px] font-mono font-extrabold rounded border border-violet-500/20">
                      POST
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(`${window.location.origin}/api/resolve?url=URL_YOUTUBE`);
                      setApiCopiedRoute(true);
                      setTimeout(() => setApiCopiedRoute(false), 2000);
                    }}
                    className="p-1 px-2 hover:bg-slate-900 border border-transparent hover:border-slate-800 text-slate-400 hover:text-white rounded text-[10px] transition-all flex items-center gap-1 font-mono font-bold"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>{apiCopiedRoute ? "Disalin!" : "Salin Route"}</span>
                  </button>
                </div>
                <div className="bg-slate-900 p-2.5 rounded font-mono text-xs text-slate-300 select-all overflow-x-auto whitespace-nowrap border border-slate-850">
                  /api/resolve?url=URL_YOUTUBE
                </div>
              </div>

              {/* Payload structure */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Format Parameter</h4>
                <div className="space-y-1.5 text-xs">
                  <div className="flex items-start gap-2 font-mono">
                    <span className="text-red-400 font-bold min-w-[36px]">url</span>
                    <span className="text-slate-450">-</span>
                    <span className="text-slate-400">URL lengkap video YouTube (Contoh: shorts, watch, m.youtube). Required.</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Playground Sandbox column */}
            <div className="lg:col-span-7 space-y-4">
              <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                <Terminal className="w-4 h-4 text-red-500" />
                Playground Sandbox & Live Run
              </h4>

              {/* Action input bar */}
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="flex-1 relative">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-xs text-slate-500 font-mono">
                    url=
                  </span>
                  <input
                    type="text"
                    value={apiTestingUrl}
                    onChange={(e) => setApiTestingUrl(e.target.value)}
                    placeholder="https://www.youtube.com/watch?v=..."
                    className="w-full pl-11 pr-4 py-2.5 bg-slate-950 border border-slate-800 focus:border-red-500/50 rounded-xl text-xs text-slate-200 placeholder-slate-600 font-mono focus:outline-none transition-all"
                  />
                </div>
                <button
                  onClick={async () => {
                    if (!apiTestingUrl.trim()) return;
                    setApiLoading(true);
                    setApiError(null);
                    setApiResult(null);
                    try {
                      const res = await fetch(`/api/resolve?url=${encodeURIComponent(apiTestingUrl.trim())}`);
                      const data = await res.json();
                      if (!res.ok) {
                        throw new Error(data.error || "Penemuan gagal di server");
                      }
                      setApiResult(data);
                    } catch (err: any) {
                      setApiError(err.message || "Gagal melakukan query");
                    } finally {
                      setApiLoading(false);
                    }
                  }}
                  disabled={apiLoading}
                  className="px-4 py-2.5 bg-red-600 hover:bg-red-500 disabled:bg-slate-800 text-white font-bold rounded-xl text-xs transition-all flex items-center justify-center gap-2 shadow-lg shadow-red-950/20"
                >
                  {apiLoading ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Mengunduh...</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>Kirim Request API</span>
                    </>
                  )}
                </button>
              </div>

              {/* Output block display */}
              <div className="border border-slate-850 rounded-xl overflow-hidden bg-slate-950/90 shadow-inner">
                <div className="flex items-center justify-between px-4 py-2 bg-slate-900 border-b border-slate-850">
                  <span className="text-[10px] text-slate-450 font-mono font-bold uppercase tracking-wider">RESPONSE HEADER (application/json)</span>
                  {apiResult && (
                    <span className="text-[10px] text-emerald-400 font-mono font-bold">
                      STATUS 200 OK
                    </span>
                  )}
                  {apiError && (
                    <span className="text-[10px] text-rose-400 font-mono font-bold">
                      STATUS ERROR
                    </span>
                  )}
                </div>

                <div className="p-4 font-mono text-xs max-h-[280px] overflow-y-auto overflow-x-auto text-slate-300 whitespace-pre leading-relaxed select-text">
                  {apiLoading && (
                    <div className="flex flex-col items-center justify-center py-10 space-y-2.5">
                      <Loader2 className="w-6 h-6 text-red-500 animate-spin" />
                      <div className="text-center">
                        <p className="text-xs text-slate-300 font-semibold">Mengambil Info & Mengunduh ke Server...</p>
                        <p className="text-[10px] text-slate-500 mt-1 max-w-[280px]">Sistem sedang mengaktifkan compiler otomatis dan buffering resolusi media.</p>
                      </div>
                    </div>
                  )}

                  {!apiLoading && !apiResult && !apiError && (
                    <p className="text-slate-600 text-center py-12 italic text-xs">Uji URL contoh di atas untuk melihat respon payload JSON lengkap.</p>
                  )}

                  {apiError && (
                    <div className="p-3 bg-rose-950/10 border border-rose-900/40 rounded-lg text-rose-400 text-xs">
                      <strong>Kesalahan API:</strong> {apiError}
                    </div>
                  )}

                  {apiResult && (
                    <div>
                      {/* Interactive preview helper banner */}
                      <div className="mb-4 p-3 bg-red-650/10 border border-red-500/20 rounded-lg flex items-center justify-between gap-3 text-xs text-red-400">
                        <div className="flex items-center gap-2">
                          <CheckCircle className="w-4 h-4 text-emerald-500" />
                          <span>Penyelesaian Berhasil! Klik tautan di JSON untuk memutar.</span>
                        </div>
                        <a 
                          href={apiResult.url} 
                          target="_blank" 
                          rel="noreferrer" 
                          referrerPolicy="no-referrer"
                          className="px-2 py-1 bg-red-600 text-white rounded font-bold text-[10px] hover:bg-red-500 transition-all flex items-center gap-1"
                        >
                          <Play className="w-3 h-3 fill-current" />
                          <span>Play MP4</span>
                        </a>
                      </div>

                      {/* Display JSON structure with clickable live link */}
                      <span>{`{`}</span>
                      <div className="pl-4">
                        <div><span className="text-violet-400">"status"</span>: <span className="text-emerald-400">"{apiResult.status}"</span>,</div>
                        <div><span className="text-violet-400">"title"</span>: <span className="text-emerald-400">"{apiResult.title.replace(/"/g, '\\"')}"</span>,</div>
                        <div><span className="text-violet-400">"filename"</span>: <span className="text-emerald-400">"{apiResult.filename}"</span>,</div>
                        <div><span className="text-violet-400">"resolution"</span>: <span className="text-emerald-400">"{apiResult.resolution}"</span>,</div>
                        <div><span className="text-violet-400">"size_bytes"</span>: <span className="text-orange-400">{apiResult.size_bytes}</span>,</div>
                        
                        {/* Make resolved preview playable link! */}
                        <div>
                          <span className="text-violet-400">"url"</span>: <span className="text-slate-400">"</span>
                          <a 
                            href={apiResult.url} 
                            target="_blank" 
                            rel="noreferrer"
                            className="text-red-400 underline font-bold hover:text-red-300 transition-colors"
                            title="Klik untuk preview/download langsung"
                          >
                            {apiResult.url}
                          </a>
                          <span className="text-slate-400">"</span>,
                        </div>

                        <div>
                          <span className="text-violet-400">"preview_url"</span>: <span className="text-slate-400">"</span>
                          <a 
                            href={apiResult.preview_url} 
                            target="_blank" 
                            rel="noreferrer"
                            className="text-red-400 underline font-bold hover:text-red-300 transition-colors"
                          >
                            {apiResult.preview_url}
                          </a>
                          <span className="text-slate-400">"</span>,
                        </div>
                        
                        <div><span className="text-violet-400">"duration"</span>: <span className="text-emerald-400">"{apiResult.duration}"</span>,</div>
                        <div><span className="text-violet-400">"thumbnail"</span>: <span className="text-slate-400">"</span><span className="text-slate-500 break-all">{apiResult.thumbnail}</span><span className="text-slate-400">"</span>,</div>
                        <div><span className="text-violet-400">"matchType"</span>: <span className="text-emerald-400">"{apiResult.matchType}"</span></div>
                      </div>
                      <span>{`}`}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

      </div>

      {/* Aesthetic Footer block */}
      <footer className="mt-20 border-t border-slate-900 text-center py-6 text-xs text-slate-500 relative z-10" id="page_footer">
        <p>© 2026 YouTube Video Downloader Pro. Digarap dengan React 19 + Tailwind.</p>
      </footer>
    </div>
  );
}
