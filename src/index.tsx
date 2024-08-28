import { Context, Random } from 'koishi';
import { HttpUtil } from "./util/HttpUtil";
import { AxiosRequestConfig, Method } from "axios";
import Jimp from 'jimp';
import JimpConstructors from 'jimp/types';

export const name = '@q78kg/pixiv';

import { Lolicon } from "./util/Interface";

import Config from "./config";
export * from './config';

const pixivUrl = {
  url: 'https://api.lolicon.app/setu/v2'
};

let _config: Config;

export function apply(ctx: Context, config: Config) {
  const logger = ctx.logger('pixiv');
  _config = config;
  ctx.command('来张色图 [tag:text]', '随机一张色图')
    .option('n', '-n <value:number>', {
      fallback: 1,
    })
    .alias('色图')
    .action(async ({ session, options }, tag) => {
      let image: Lolicon;
      await session.send('不可以涩涩哦~');
      const messages = [];
      for (let i = 0; i < Math.min(10, options.n); i++) {
        try {
          image = await getPixivImage(ctx, tag);
          if (image.urls === undefined) {
            messages.push(
              <message>
                <text content={'没有获取到喵\n'}></text>
              </message>
            );
          } else {
            let imageUrl: string;
            if (_config.imageConfusion) {  // 根据配置决定是否进行图片混淆
              const imageBuffer = await readRemoteImage(image.urls.original, (image) => {
                const dotDiameter = 10;

                const x = image.bitmap.width - dotDiameter;
                const y = image.bitmap.height - dotDiameter;

                for (let i = 0; i < dotDiameter; i++) {
                  for (let j = 0; j < dotDiameter; j++) {
                    const color = image.getPixelColor(x + i, y + j);
                    const _r = (color >> 24) & 0xFF;
                    const r = _r + 10 > 255 ? _r - 10 : _r + 10;
                    const _g = (color >> 16) & 0xFF;
                    const g = _g + 10 > 255 ? _g - 10 : _g + 10;
                    const _b = (color >> 8) & 0xFF;
                    const b = _b + 10 > 255 ? _b - 10 : _b + 10;
                    const a = color & 0xFF;
                    const newColor = Jimp.rgbaToInt(r, g, b, a);
                    image.setPixelColor(newColor, x + i, y + j);
                  }
                }
              });

              imageUrl = arrayBufferToDataUrl(imageBuffer, getImageMimeType(image.urls.original));
            } else {
              imageUrl = image.urls.original;
            }

            messages.push(
              <message>
                <image url={imageUrl}></image>
                <text content={`\ntitle：${image.title}\n`}></text>
                <text content={`id：${image.pid}\n`}></text>
                <text content={`tags：${image.tags.map((item) => {
                  return '#' + item;
                }).join(' ')}\n`}></text>
              </message>
            );
          }
        } catch (e) {
          messages.push(
            <message>
              <text content={`图片获取失败了喵~，code:${e.code}`}></text>
            </message>
          );
        }
      }
      session.send(
        <>
          <message forward={true}>
            {messages}
          </message>
        </>
      ).then(res => {
        if (res.length === 0) {
          logger.error(`消息发送失败，账号可能被风控`);
          session.send(
            <>
              <at id={session.userId}></at>
              <text content={'消息发送失败了喵，账号可能被风控\n'}></text>
            </>
          );
        }
      });
    });
}

async function getPixivImage(ctx: Context, tag: string) {
  const params: Record<string, any> = {};
  if (_config.isR18) {
    params['r18'] = Random.bool(_config.r18P) ? 1 : 0;
  } else {
    params['r18'] = 0;
  }

  if (tag !== undefined) {
    params['tag'] = tag.split(' ').join('|');
  }

  if (_config.excludeAI) {
    params['excludeAI'] = true;
  }

  if (_config.baseUrl) {
    params['proxy'] = _config.baseUrl;
  }

  const res = await ctx.http.get(HttpUtil.setParams(pixivUrl.url, params), getAxiosConfig() as any);
  return res.data[0];
}

const getAxiosConfig = (): AxiosRequestConfig | undefined => {
  if (!_config.isProxy) {
    return undefined;
  }

  const proxyUrl = new URL(_config.proxyHost);
  return {
    proxy: {
      host: proxyUrl.hostname,
      port: Number(proxyUrl.port),
      protocol: proxyUrl.protocol.replace(':', '') as 'http' | 'https',
    },
    method: 'GET' as Method,
  };
};

function getImageMimeType(url: string): string {
  const MimeType = url.split('.').pop();
  const TypeMap = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
  };
  return TypeMap[MimeType];
}

async function readRemoteImage(url: string, onRead?: (image: JimpConstructors) => void): Promise<ArrayBuffer> {
  const MimeType = url.split('.').pop();
  const TypeMap = {
    jpg: Jimp.MIME_JPEG,
    jpeg: Jimp.MIME_JPEG,
    png: Jimp.MIME_PNG,
    gif: Jimp.MIME_GIF,
  };
  return Jimp.read(url).then((image) => {
    if (onRead) {
      onRead(image);
    }
    return image.getBufferAsync(TypeMap[MimeType]);
  });
}

function arrayBufferToDataUrl(arrayBuffer: ArrayBuffer, type: string): string {
  const base64 = Buffer.from(arrayBuffer).toString('base64');
  return `data:${type};base64,${base64}`;
}
