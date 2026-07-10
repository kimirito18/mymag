import crypto from "node:crypto";
import net from "node:net";
import tls from "node:tls";
import { AsyncLocalStorage } from "node:async_hooks";

type Connection = {
    socket: net.Socket | tls.TLSSocket;
};

type QueryRow = Record<string, string | null>;
type QueryExecutor = (sql: string)=>Promise<QueryRow[]>;

const host = process.env.PGHOST ?? "127.0.0.1";
const port = Number(process.env.PGPORT ?? "54322");
const user = process.env.PGUSER ?? "postgres";
const database = process.env.PGDATABASE ?? "postgres";
const password = process.env.PGPASSWORD ?? "postgres";
const sslMode = (process.env.PGSSLMODE ?? "disable").trim().toLowerCase();

const cstring = (value: string)=>Buffer.from(`${value}\0`);
const int32 = (value: number)=>{
    const buffer = Buffer.alloc(4);
    buffer.writeInt32BE(value, 0);
    return buffer;
};
const message = (type: string, payload: Buffer)=>Buffer.concat([
        Buffer.from(type),
        int32(payload.length + 4),
        payload
    ]);
const queryMessage = (text: string)=>message("Q", cstring(text));
const sslRequestMessage = ()=>{
    const buffer = Buffer.alloc(8);
    buffer.writeInt32BE(8, 0);
    buffer.writeInt32BE(80877103, 4);
    return buffer;
};
const readCString = (buffer: Buffer, offset: number): [string, number]=>{
    const end = buffer.indexOf(0, offset);
    return [
        buffer.slice(offset, end).toString(),
        end + 1
    ];
};
const parseScram = (text: string)=>Object.fromEntries(text.split(",").map((part)=>[
        part[0],
        part.slice(2)
    ]));
const hmac = (key: crypto.BinaryLike, data: crypto.BinaryLike)=>crypto.createHmac("sha256", key).update(data).digest();
const xor = (left: Buffer, right: Buffer)=>Buffer.from(left.map((value, index)=>value ^ right[index]));

const startupMessage = ()=>{
    const payload = Buffer.concat([
        int32(196608),
        cstring("user"),
        cstring(user),
        cstring("database"),
        cstring(database),
        cstring("application_name"),
        cstring("mymag_next_api"),
        Buffer.from([
            0
        ])
    ]);
    return Buffer.concat([
        int32(payload.length + 4),
        payload
    ]);
};

const errorFields = (payload: Buffer)=>{
    let offset = 0;
    const fields: Record<string, string> = {};
    while(offset < payload.length && payload[offset] !== 0){
        const code = String.fromCharCode(payload[offset]);
        const [value, nextOffset] = readCString(payload, offset + 1);
        fields[code] = value;
        offset = nextOffset;
    }
    return fields;
};

const transactionExecutorStorage = new AsyncLocalStorage<QueryExecutor>();

const openSocket = ()=>new Promise<net.Socket | tls.TLSSocket>((resolve, reject)=>{
        const socket = net.connect(port, host);
        const cleanup = ()=>{
            socket.off("connect", onConnect);
            socket.off("error", onError);
            socket.off("data", onSslResponse);
        };
        const onError = (error: Error)=>{
            cleanup();
            reject(error);
        };
        const onTlsError = (error: Error)=>{
            cleanup();
            socket.destroy();
            reject(error);
        };
        const onConnect = ()=>{
            if (sslMode === "disable") {
                cleanup();
                resolve(socket);
                return;
            }
            socket.once("data", onSslResponse);
            socket.write(sslRequestMessage());
        };
        const onSslResponse = (chunk: Buffer)=>{
            socket.off("error", onError);
            const response = chunk.subarray(0, 1).toString("utf8");
            if (response === "S") {
                cleanup();
                const secureSocket = tls.connect({
                    socket,
                    servername: host
                }, ()=>{
                    secureSocket.off("error", onTlsError);
                    resolve(secureSocket);
                });
                secureSocket.once("error", onTlsError);
                return;
            }
            if (response === "N" && sslMode === "prefer") {
                cleanup();
                resolve(socket);
                return;
            }
            cleanup();
            socket.destroy();
            reject(new Error(`PostgreSQL server rejected SSL mode "${sslMode}"`));
        };
        socket.once("connect", onConnect);
        socket.once("error", onError);
    });

const connect = ()=>new Promise<Connection>((resolve, reject)=>{
        const nonce = crypto.randomBytes(18).toString("base64").replace(/[^a-zA-Z0-9]/g, "").slice(0, 24);
        const clientFirstBare = `n=${user},r=${nonce}`;
        const clientFirst = `n,,${clientFirstBare}`;
        let serverFirst = "";
        let serverSignatureExpected = "";
        let buffer = Buffer.alloc(0);
        let socket: net.Socket | tls.TLSSocket;
        const cleanup = ()=>{
            if (socket) {
                socket.off("data", onData);
                socket.off("error", reject);
            }
        };
        const saslInitialMessage = ()=>{
            const initial = Buffer.from(clientFirst);
            return message("p", Buffer.concat([
                cstring("SCRAM-SHA-256"),
                int32(initial.length),
                initial
            ]));
        };
        const saslFinalMessage = ()=>{
            const parsed = parseScram(serverFirst);
            const clientFinalWithoutProof = `c=biws,r=${parsed.r}`;
            const authMessage = `${clientFirstBare},${serverFirst},${clientFinalWithoutProof}`;
            const saltedPassword = crypto.pbkdf2Sync(password, Buffer.from(parsed.s, "base64"), Number(parsed.i), 32, "sha256");
            const clientKey = hmac(saltedPassword, "Client Key");
            const storedKey = crypto.createHash("sha256").update(clientKey).digest();
            const clientSignature = hmac(storedKey, authMessage);
            const clientProof = xor(clientKey, clientSignature).toString("base64");
            const serverKey = hmac(saltedPassword, "Server Key");
            serverSignatureExpected = hmac(serverKey, authMessage).toString("base64");
            return message("p", Buffer.from(`${clientFinalWithoutProof},p=${clientProof}`));
        };
        const onData = (data: Buffer)=>{
            buffer = Buffer.concat([
                buffer,
                data
            ]);
            while(buffer.length >= 5){
                const type = String.fromCharCode(buffer[0]);
                const length = buffer.readInt32BE(1);
                if (buffer.length < length + 1) break;
                const payload = buffer.slice(5, length + 1);
                buffer = buffer.slice(length + 1);
                if (type === "R") {
                    const code = payload.readInt32BE(0);
                    if (code === 10) socket.write(saslInitialMessage());
                    else if (code === 11) {
                        serverFirst = payload.slice(4).toString();
                        socket.write(saslFinalMessage());
                    } else if (code === 12) {
                        const serverSignature = parseScram(payload.slice(4).toString()).v;
                        if (serverSignature !== serverSignatureExpected) {
                            cleanup();
                            socket.end();
                            reject(new Error("SCRAM server signature mismatch"));
                        }
                    } else if (code !== 0) {
                        cleanup();
                        socket.end();
                        reject(new Error(`Unsupported auth code ${code}`));
                    }
                } else if (type === "E") {
                    cleanup();
                    socket.end();
                    reject(new Error(JSON.stringify(errorFields(payload))));
                } else if (type === "Z") {
                    cleanup();
                    resolve({
                        socket
                    });
                    return;
                }
            }
        };
        openSocket().then((openedSocket)=>{
            socket = openedSocket;
            socket.on("data", onData);
            socket.on("error", reject);
            socket.write(startupMessage());
        }).catch(reject);
    });

const queryRowsWithSocket = (socket: net.Socket | tls.TLSSocket, sql: string)=>new Promise<QueryRow[]>((resolve, reject)=>{
        let buffer = Buffer.alloc(0);
        let columns: string[] = [];
        const rows: QueryRow[] = [];
        const cleanup = ()=>{
            socket.off("data", onData);
            socket.off("error", onError);
        };
        const onError = (error: Error)=>{
            cleanup();
            reject(error);
        };
        const onData = (data: Buffer)=>{
            buffer = Buffer.concat([
                buffer,
                data
            ]);
            while(buffer.length >= 5){
                const type = String.fromCharCode(buffer[0]);
                const length = buffer.readInt32BE(1);
                if (buffer.length < length + 1) break;
                const payload = buffer.slice(5, length + 1);
                buffer = buffer.slice(length + 1);
                if (type === "T") {
                    const fieldCount = payload.readInt16BE(0);
                    let offset = 2;
                    columns = [];
                    for(let index = 0; index < fieldCount; index += 1){
                        const [name, nextOffset] = readCString(payload, offset);
                        columns.push(name);
                        offset = nextOffset + 18;
                    }
                } else if (type === "D") {
                    const fieldCount = payload.readInt16BE(0);
                    let offset = 2;
                    const row: QueryRow = {};
                    for(let index = 0; index < fieldCount; index += 1){
                        const valueLength = payload.readInt32BE(offset);
                        offset += 4;
                        const value = valueLength === -1 ? null : payload.slice(offset, offset + valueLength).toString();
                        if (valueLength !== -1) offset += valueLength;
                        row[columns[index]] = value;
                    }
                    rows.push(row);
                } else if (type === "E") {
                    cleanup();
                    reject(new Error(JSON.stringify(errorFields(payload))));
                } else if (type === "Z") {
                    cleanup();
                    resolve(rows);
                }
            }
        };
        socket.on("data", onData);
        socket.on("error", onError);
        socket.write(queryMessage(sql));
    });

export const queryRows = async (sql: string)=> {
    const transactionExecutor = transactionExecutorStorage.getStore();
    if (transactionExecutor) {
        return transactionExecutor(sql);
    }
    const { socket } = await connect();
    try {
        return await queryRowsWithSocket(socket, sql);
    } finally {
        socket.end();
    }
};

export const withTransaction = async <T>(callback: ()=>Promise<T>): Promise<T>=>{
    const existingExecutor = transactionExecutorStorage.getStore();
    if (existingExecutor) {
        return callback();
    }
    const { socket } = await connect();
    const executor: QueryExecutor = (sql: string)=>queryRowsWithSocket(socket, sql);
    try {
        await executor("begin;");
        const result = await transactionExecutorStorage.run(executor, callback);
        await executor("commit;");
        return result;
    } catch (error) {
        try {
            await executor("rollback;");
        } catch {
        }
        throw error;
    } finally {
        socket.end();
    }
};
