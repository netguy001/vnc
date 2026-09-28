# SFTP File Manager Architecture & Guide

## 1. Overview
The SFTP subsystem allows administrators to navigate, manage, upload, and download files on remote Linux servers directly from the web console.

### Capabilities:
- **Directory Traversal**: Real-time folder browsing with breadcrumb navigation.
- **File Metadata**: Displays file sizes, Unix octal permissions, and modification timestamps.
- **File Upload**: Streams multipart file uploads directly to the remote server through an SFTP write stream.
- **File Download**: Streams remote files directly into the browser with proper Content-Disposition headers.
- **Directory Management**: Creates folders (`mkdir`), renames/moves files, and handles deletions.
- **Security**: The browser never sees SFTP credentials; all operations are mediated by authenticated backend sessions.
