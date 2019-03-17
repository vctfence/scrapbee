package main
import (
	"fmt"
	"net/http"
	"time"
	"bufio"
	"os"
	"io"
	// "io/ioutil"  
  "log"
  "strings"
  "encoding/json"
  "strconv"
  "regexp"
  "encoding/binary" 
  "encoding/base64"
  // "crypto/md5"
  // "crypto/sha1"
  // "mime"
  // "path"
  "path/filepath"
  "os/exec"
  "runtime"
  "github.com/gorilla/mux"
)
var config map[string]interface{}
var rdfdirs map[string]string
var currentwd string
var cwd string
var pathSep int32
var logger *log.Logger
var fs_root http.Handler
var fs_data http.Handler
var srv *http.Server

func IsFile(name string) bool {
  fi, err := os.Stat(name)
  if err != nil {
    return false
  }
  mode := fi.Mode()
  return mode.IsRegular()
}

func IsDir(name string) bool {
  fi, err := os.Stat(name)
  if err != nil {
    return false
  }
  return fi.IsDir()
  // mode := fi.Mode()
  // return mode.IsRegular()
}

func createDirImpl(name string) bool {
  err := os.MkdirAll(name, 0755)
  if err == nil {
    return true
  } else {
		// fmt.Println("Error: ", err)
		logger.Println(err.Error())
    return false
  }
}

func CreateDir(name string) bool {
  if IsDir(name) {
		// logger.Println(fmt.Sprintf("%s is already a directory.\n", name))
    return true
  }
  if createDirImpl(name) {
		// logger.Println(fmt.Sprintf("%s Create directory successfully.\n", name))
    return true
  } else {
    return false
  }
}

func saveFileHandle(w http.ResponseWriter, r *http.Request){
  w.Header().Add("Content-Type", "text/plain")
  if r.Method == "POST" {
    filename := r.FormValue("filename")
    content := r.FormValue("content")
    downloadpath := filepath.Dir(filename)
    if CreateDir(downloadpath) {
      f, err := os.Create(filename)
      if err != nil {
        logger.Printf("Open file for write fail,(%s) %s\n", filename, err)
        return
      }
      f.WriteString(content)	
    }
  }
}

func saveBinFileHandle(w http.ResponseWriter, r *http.Request){
  w.Header().Add("Content-Type", "text/plain")
  file, _, _ := r.FormFile("file") 
  defer file.Close()
  // fW, err := os.Create("" + head.Filename)
  // logger.Printf("%q", head)
  filename := r.FormValue("filename")  
  downloadpath := filepath.Dir(filename)
  if CreateDir(downloadpath) {
    fW, err := os.Create(filename)
    if err != nil {
      logger.Printf("Failed to create file %s", filename)
      return
    }
    defer fW.Close()
    _, err = io.Copy(fW, file)
    if err != nil {
      logger.Printf("Failed to save file %s", filename)
      return
    }
    // logger.Println("File saved successful")
  }
}

func downloadHandle(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
  w.Header().Add("Content-Type", "text/plain")
  if r.Method == "GET" {
    //
	}
	if r.Method == "POST" {
    url := r.FormValue("url")
    filename := r.FormValue("filename")
    downloadpath := filepath.Dir(filename)
    logger.Println(downloadpath)
    if CreateDir(downloadpath) {				
      if len(url) > 0 {
        reg, _ := regexp.Compile(`(?i)^data:image/(.+?);base64,(.+)`)
        m := reg.FindStringSubmatch(url)
        if len(m) > 1 { /*** base 64 */
          f := downloadBase64(m[2], filename, m[1])
          io.WriteString(w, f)
        } else {
          logger.Printf("found and download url: %s %s\n", url) // %q
          f := downlaodFile(url, filename)
          io.WriteString(w, f)
        }
      }
    }
  }
}

func downloadBase64(source string, filepath string, ext string) string{
  fullpath := filepath // + "." + ext
  b, _ := base64.StdEncoding.DecodeString(source)
  f, _ := os.Create(filepath)
  binary.Write(f, binary.LittleEndian, b)
  return fullpath
}

/* DOWNLAOD FILE FROM URL TO LOCAL */
func downlaodFile(url string, filepath string) string{
  client := &http.Client{}
  request, err := http.NewRequest("GET", url, nil)

  res, err := client.Do(request)
  // res, err := http.Get(url)
  if err != nil {
    logger.Println(err.Error())
		return "" 
  }
 
  f, err := os.Create(filepath)
  // f, err := os.Create(filepath)
  if err != nil {  
		logger.Println(err.Error())
		return "" 
  }
  defer f.Close()
	io.Copy(f, res.Body)
	return filepath
}

func start_web_server(port string) {
  logger.Print("start server\n")
  /**** create server */
  if srv != nil {
    srv.Shutdown(nil)
  }
  srv = &http.Server{
    Addr:           fmt.Sprintf("127.0.0.1:%s", port),
    Handler:        nil,
    ReadTimeout:    10 * time.Second,
    WriteTimeout:   10 * time.Second,
    MaxHeaderBytes: 1 << 20,
  }
  logger.Println("Try to start Server and hold")
  var err error
  go func() {
    err = srv.ListenAndServe() // waiting...
  }()
  time.Sleep(time.Duration(1)*time.Second)
  m := Message{"0", "0", "0", "0", "0", "0"}
  m.Serverstate = "ok"
  m.Serverport = port
  // defer srv.Shutdown(nil)
  if err != nil {
    logger.Println(fmt.Sprintf("Listen Error: %s", err))
    m.Serverstate = "fail"
    m.Error = err.Error()
  }
  b, _ := json.Marshal(m)
  sendMsgBytes(b)
  logger.Println("Server Started")
}

func deleteDirHandle(w http.ResponseWriter, r *http.Request){
  w.Header().Add("Content-Type", "text/plain")
  if r.FormValue("path") == "" {
    return
  }
  path := r.FormValue("path")
  if IsDir(path) {
    os.RemoveAll(path)
  }
}

func isFileHandle(w http.ResponseWriter, r *http.Request){
  w.Header().Add("Content-Type", "text/plain")
  path := r.FormValue("path")
  b := "no"
  if IsFile(path) {
    b = "yes"
  }
  // logger.Printf("%s %s\n", path, b)
  io.WriteString(w, b)
}

func rootFsHandle(w http.ResponseWriter, r *http.Request){
  params := mux.Vars(r)
  path := params["path"]
  if runtime.GOOS == "linux" || runtime.GOOS == "darwin"{
    path = "/" + path
  }
  // logger.Printf("name %s \n", path)
  http.ServeFile(w, r, path)
}

func dataFsHandle(w http.ResponseWriter, r *http.Request){
  rp := r.FormValue("rdf_path")
  f := filepath.Join(rp, "data", strings.TrimPrefix(r.URL.Path, "/data"))
  http.ServeFile(w, r, f)
}

func setRdfPathHandle(w http.ResponseWriter, r *http.Request){
  w.Header().Add("Content-Type", "text/plain")
  rdf_path := r.FormValue("path")
  logger.Printf("switch to rdf path %s \n", rdf_path)
  // io.WriteString(w, "ok")
}

func fileManagerHandle(w http.ResponseWriter, r *http.Request){
  w.Header().Add("Content-Type", "text/plain")
  p := r.FormValue("path")
  var err error
	switch runtime.GOOS {
	case "linux":
		err = exec.Command("xdg-open", p).Start()
	case "windows":
		err = exec.Command("rundll32", "url.dll,FileProtocolHandler", p).Start()
	case "darwin":
		err = exec.Command("open", p).Start()
	default:
		err = fmt.Errorf("unsupported platform")
	}
	if err != nil {
		log.Fatal(err)
	}
  io.WriteString(w, "ok")
}

/* ========== MAIN ENTRIES ========== */
func main(){
  /** log */
	logfile,err:=os.OpenFile("scrapbee_backend.log", os.O_RDWR|os.O_CREATE|os.O_APPEND, 0666)
  if err!=nil{
    fmt.Printf("%s\r\n",err.Error())
    os.Exit(-1)
  }
  defer logfile.Close()
  logger = log.New(logfile,"",log.Ldate|log.Ltime|log.Lshortfile)
  logger.Println("start backend\n")
  
  /** handles by mux */
  rtr := mux.NewRouter()
  rtr.HandleFunc("/file-service/{path:.+}", rootFsHandle).Methods("GET")
  http.Handle("/", rtr)

  /** handles by http */
  http.HandleFunc("/isfile/", isFileHandle)
  http.HandleFunc("/deletedir/", deleteDirHandle)
  http.HandleFunc("/filemanager/", fileManagerHandle)
  http.HandleFunc("/download", downloadHandle)
  http.HandleFunc("/savefile", saveFileHandle)
  http.HandleFunc("/savebinfile", saveBinFileHandle)
    
  /** commmand line args */  
  if len(os.Args) == 2 && os.Args[1] == "web-server" {
    go start_web_server("9900")
    // return
  } else if len(os.Args) == 2 && os.Args[1] == "init" {
		// initBackend ()
		return
	}
	var msg []byte
	for {   /** main loop for message interface */
    time.Sleep(time.Duration(1) * time.Second)
		msg = getMsg()
    if string(msg) != "" {
      // logger.Println(fmt.Sprintf("json string: %s", string(msg)))
      unscaped_str, err := strconv.Unquote("\"" + string(msg) + "\"")
      if err != nil {
        logger.Println(fmt.Sprintf("Unquote error: %s", err.Error()))
        continue
      }
      // logger.Println(unscaped_str)
      /**** un-stringify the json string */
      var myjson map[string]string
      if err := json.Unmarshal([]byte(unscaped_str), &myjson); err != nil {
        logger.Println(fmt.Sprintf("Unmarshal error: %s", err.Error()))
        continue
      }
      // logger.Println(fmt.Sprintf("msgid=%s", myjson["msgid"]))
      /**** process commands */
      command := myjson["command"]
      logger.Println(fmt.Sprintf("command=%s", command))
      if command == "web-server" {
        port := myjson["port"]
        go start_web_server(port)
      }
    }
	}
}

type Message struct {
  Scrapbook string
	Rdfloaded string
	Serverport string
	Serverstate string
	Downloadjs string
  Error string
}

func sendMsgBytes (arr []byte) {
	var l []byte
	l = []byte{byte((len(arr)>>0)&0xFF), byte((len(arr)>>8)&0xFF), byte((len(arr)>>16)&0xFF), byte((len(arr)>>32)&0xFF)}
	// fmt.Println("s:", []byte(s), "a:", a, " arr:", arr, " len(arr): ", len(arr)>>8, " cap(arr): ", cap(arr), " l: ", l)
	os.Stdout.Write(l);
	os.Stdout.Write(arr);
}

func getMsg () []byte{
	inputReader := bufio.NewReader(os.Stdin)	
  // s, err := inputReader.Peek(4)  
	for {
		s, err := inputReader.Peek(4)
    if err != nil{
      // logger.Println(fmt.Sprintf("Error %s", err))
      // b := make([]byte, 0)
      continue
    }
		if s[0] > 0 {
			inputReader.Discard(4)
			b := make([]byte, s[0])
			_, _ = inputReader.Read(b)
			return b[1:len(b)-1]
		}
	}
}
