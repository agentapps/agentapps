# MinIO

Lets an agent work with a MinIO server, or another S3-compatible server the `minio` client
library can reach: list, create and delete buckets, list, upload, download, copy and delete
objects, and make presigned URLs. The server address and the access keys are system secrets, so
every installation of the app uses the same server and the same account.

## Tools

| Tool | What it does | Writes? |
|---|---|---|
| `list-buckets` | Lists every bucket on the server. | no |
| `bucket-exists` | Says whether a bucket exists. | no |
| `create-bucket` | Creates a bucket, in region `us-east-1` unless another is given. | yes, asks first |
| `delete-bucket` | Deletes an empty bucket. Cannot be undone. | yes, asks first |
| `list-objects` | Lists the objects in a bucket, optionally under a prefix (100 by default). | no |
| `get-object-info` | Returns an object's size, etag, modification date and metadata. | no |
| `upload-object` | Uploads a local file or a string as an object, replacing an object of the same name. | yes, asks first |
| `download-object` | Saves an object to a local file, in `~/Downloads/minio/` unless a path is given, replacing a file of the same name. | yes, asks first |
| `copy-object` | Copies an object within a bucket or to another one, replacing an object of the same name. | yes, asks first |
| `delete-object` | Deletes an object. Cannot be undone. | yes, asks first |
| `get-presigned-url` | Makes a temporary `GET` or `PUT` URL for an object, valid one hour by default and seven days at most. | no |

Limits:

- `upload-object` and `download-object` read and write files on the machine the app runs on, at
  any path the call names.
- Anyone who holds a presigned URL can read or write that object until it expires.

## Setup

```bash
agentapps install app.minio minio
agentapps config app.minio ENDPOINT:https://minio.example.com ACCESS_KEY:<access key> SECRET_KEY:<secret key>
agentapps minio tools
agentapps minio tool list-objects bucket:<bucket name> limit:10
```

All three are system secrets, set once on the app id:

- `ENDPOINT`: the server's address. With `https://` the app uses TLS and port 443; with `http://`
  or no scheme it uses plain HTTP and port 9000. Add `:<port>` for another port.
- `ACCESS_KEY` and `SECRET_KEY`: an access key pair of the server. Create it in the MinIO
  console or with MinIO's admin tools. The app can do whatever that key's policy allows.

## Terms of use

The app talks to a server you or your provider run, so that server's terms apply. MinIO itself
is published under the GNU AGPL v3: <https://github.com/minio/minio/blob/master/LICENSE>.
MinIO's commercial licence is at
<https://www.min.io/legal/customer-license-and-subscription-agreement>.

## Logos

TODO: record the official source of `assets/logo.svg` and `assets/logo-mono.svg` (MinIO's press
kit, brand guidelines or its own site). They have been in the repository since before this README
existed and their origin was not written down.
