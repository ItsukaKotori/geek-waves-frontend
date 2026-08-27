/**
 * js-sha1 / js-sha512 为纯 JS 实现,包内未携带 TypeScript 声明,此处补最小面:
 * 项目仅用到 create() → update()/hex() 的增量哈希形态。
 */

declare module 'js-sha1' {
  export interface IncrementalHasher {
    update(data: string | number[] | ArrayBuffer | ArrayBufferView): void
    hex(): string
  }
  export function sha1(message?: string | number[] | ArrayBuffer | ArrayBufferView): string
  export namespace sha1 {
    export function create(): IncrementalHasher
  }
}

declare module 'js-sha512' {
  export interface IncrementalHasher {
    update(data: string | number[] | ArrayBuffer | ArrayBufferView): void
    hex(): string
  }
  export function sha512(message?: string | number[] | ArrayBuffer | ArrayBufferView): string
  export namespace sha512 {
    export function create(): IncrementalHasher
  }
}
