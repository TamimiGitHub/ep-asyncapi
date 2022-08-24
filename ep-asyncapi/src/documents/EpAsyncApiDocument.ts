import yaml from "js-yaml";

import { AsyncAPIDocument, Message, Channel } from '@asyncapi/parser';
import { EpAsyncApiSpecError, EpAsyncApiXtensionError } from '../utils/EpAsyncApiErrors';
import { EpAsyncApiMessageDocument } from "./EpAsyncApiMessageDocument";
import { EpAsyncApiChannelDocument } from "./EpAsyncApiChannelDocument";
import { EpAsyncApiChannelParameterDocument } from "./EpAsyncApiChannelParameterDocument";
import { EpAsynApiChannelPublishOperation, EpAsyncApiChannelSubscribeOperation } from "./EpAsyncApiChannelOperation";

enum E_EpAsyncApiExtensions {
  X_EP_APPLICATION_DOMAIN_NAME = "x-ep-application-domain-name",
};

export enum E_EpAsyncApiContentTypes {
  APPLICATION_JSON = "application/json"
}

export type T_EpAsyncApi_LogInfo = {
  title: string;
  version: string;
  applicationDomainName: string;
}

export type T_EpAsyncApiChannelDocumentMap = Map<string, EpAsyncApiChannelDocument>;
export type T_EpAsyncApiChannelParameterDocumentMap = Map<string, EpAsyncApiChannelParameterDocument>;
export type T_EpAsyncApiMessageDocumentMap = Map<string, EpAsyncApiMessageDocument>;
export type T_EpAsyncApiEventNames = {
  publishEventNames: Array<string>;
  subscribeEventNames: Array<string>;
}

export class EpAsyncApiDocument {
  // private appConfig: TCliAppConfig;
  private asyncApiDocument: AsyncAPIDocument;
  private overrideEpApplicationDomainName: string | undefined;
  private prefixEpApplicationDomainName: string | undefined;
  private asyncApiDocumentJson: any;
  private applicationDomainName: string;

  private getJSON(asyncApiDocument: AsyncAPIDocument): any {
    const funcName = 'getJSON';
    const logName = `${EpAsyncApiDocument.name}.${funcName}()`;
    const anyDoc: any = asyncApiDocument;
    if(anyDoc["_json"] === undefined) throw new EpAsyncApiSpecError(logName, this.constructor.name, '_json not found in parsed async api spec', {
      asyncApiSpecTitle: this.getTitle(),
      details: undefined
    });
    return anyDoc["_json"];
  }

  private get_X_EpApplicationDomainName(): string | undefined {
    // TODO: there should be a parser method to get this
    return this.asyncApiDocumentJson[E_EpAsyncApiExtensions.X_EP_APPLICATION_DOMAIN_NAME];
  }

  private determineApplicationDomainName(): string {
    const funcName = 'determineApplicationDomainName';
    const logName = `${EpAsyncApiDocument.name}.${funcName}()`;

    let appDomainName: string | undefined = this.overrideEpApplicationDomainName;
    if(appDomainName === undefined) {
      const specAppDomainName = this.get_X_EpApplicationDomainName();
      if(specAppDomainName === undefined) appDomainName = undefined;
      else appDomainName = specAppDomainName;
    }
    if(appDomainName === undefined) throw new EpAsyncApiXtensionError(logName, this.constructor.name, "no application domain name defined", {
      asyncApiSpecTitle: this.getTitle(),
      xtensionKey: E_EpAsyncApiExtensions.X_EP_APPLICATION_DOMAIN_NAME,
    });
    // add the prefix 
    if(this.prefixEpApplicationDomainName !== undefined) appDomainName = `${this.prefixEpApplicationDomainName}/${appDomainName}`;
    return appDomainName;
  }
  
  constructor(asyncApiDocument: AsyncAPIDocument, overrideEpApplicationDomainName: string | undefined, prefixEpApplicationDomainName: string | undefined) {
    this.asyncApiDocument = asyncApiDocument;
    this.asyncApiDocumentJson = this.getJSON(asyncApiDocument);
    this.overrideEpApplicationDomainName = overrideEpApplicationDomainName;
    this.prefixEpApplicationDomainName = prefixEpApplicationDomainName;
    this.applicationDomainName = this.determineApplicationDomainName();
  }

  public getAsyncApiSpecVersion(): string { return this.asyncApiDocument.version(); }

  public getTitle(): string { return this.asyncApiDocument.info().title(); }

  public getVersion(): string { return this.asyncApiDocument.info().version(); }

  public getDescription(): string { 
    const descr: string | null = this.asyncApiDocument.info().description();
    if(descr) return descr;
    return '';
  }

  public getApplicationDomainName(): string { return this.applicationDomainName; }

  public getTitleAsFilePath(): string {
    return this.getTitle().replaceAll(/[^0-9a-zA-Z]+/g, '-');
  }

  public getTitleAsFileName(ext: string): string {
    return `${this.getTitleAsFilePath()}.${ext}`;
  }

  public getAsSanitizedJson(): any {
    const sanitized = JSON.parse(JSON.stringify(this.asyncApiDocumentJson, (k,v) => {
      if(k.startsWith("x-parser")) return undefined;
      return v;
    }));

    return sanitized;
  }

  public getAsSanitizedYamlString(): string {
    const json = this.getAsSanitizedJson();
    return yaml.dump(json);
  }

  public getEpAsyncApiEventNames(): T_EpAsyncApiEventNames {
    const epAsyncApiEventNames: T_EpAsyncApiEventNames = {
      publishEventNames: [],
      subscribeEventNames: [],
    };
    const epAsyncApiChannelDocumentMap: T_EpAsyncApiChannelDocumentMap = this.getEpAsyncApiChannelDocumentMap();
    for(const [topic, epAsyncApiChannelDocument] of epAsyncApiChannelDocumentMap) {
      const epAsynApiChannelPublishOperation: EpAsynApiChannelPublishOperation | undefined = epAsyncApiChannelDocument.getEpAsynApiChannelPublishOperation();
      if(epAsynApiChannelPublishOperation !== undefined) {
        const epAsyncApiMessageDocument: EpAsyncApiMessageDocument = epAsynApiChannelPublishOperation.getEpAsyncApiMessageDocument()
        epAsyncApiEventNames.publishEventNames.push(epAsyncApiMessageDocument.getMessageName());
      }
      const epAsyncApiChannelSubscribeOperation: EpAsyncApiChannelSubscribeOperation | undefined = epAsyncApiChannelDocument.getEpAsyncApiChannelSubscribeOperation();
      if(epAsyncApiChannelSubscribeOperation !== undefined) {
        const epAsyncApiMessageDocument: EpAsyncApiMessageDocument = epAsyncApiChannelSubscribeOperation.getEpAsyncApiMessageDocument()
        epAsyncApiEventNames.subscribeEventNames.push(epAsyncApiMessageDocument.getMessageName());
      }
    }
    return epAsyncApiEventNames;
  }

  public getEpAsyncApiChannelDocumentMap(): T_EpAsyncApiChannelDocumentMap {
    const channels: Record<string, Channel> = this.asyncApiDocument.channels();

    const epAsyncApiChannelDocumentMap: T_EpAsyncApiChannelDocumentMap = new Map<string, EpAsyncApiChannelDocument>();
    for(const [key, channel] of Object.entries(channels)) {
      const epAsyncApiChannelDocument = new EpAsyncApiChannelDocument(this, key, channel);
      epAsyncApiChannelDocumentMap.set(key, epAsyncApiChannelDocument);
    }
    return epAsyncApiChannelDocumentMap;
  }

  public getEpAsyncApiMessageDocumentMap(): T_EpAsyncApiMessageDocumentMap {
    // const funcName = 'getMessageDocuments';
    // const logName = `${CliAsyncApiDocument.name}.${funcName}()`;

    const allMessages: Map<string, Message> = this.asyncApiDocument.allMessages();

    const epAsyncApiMessageDocumentMap: T_EpAsyncApiMessageDocumentMap = new Map<string, EpAsyncApiMessageDocument>();
    
    for(let [key, message] of allMessages) {
      const epAsyncApiMessageDocument = new EpAsyncApiMessageDocument(this, undefined, key, message);
      epAsyncApiMessageDocumentMap.set(key, epAsyncApiMessageDocument);
    }
    return epAsyncApiMessageDocumentMap;
  }

  public getSupportedContentTypes(): Array<string> {
    return Object.values(E_EpAsyncApiContentTypes);
  }

  public getDefaultContentType(): string | undefined {
    const defaultContentType: string | null = this.asyncApiDocument.defaultContentType();
    if(defaultContentType === null) return undefined;
    return defaultContentType;
  }
  
  public getLogInfo(): T_EpAsyncApi_LogInfo {
    return {
      title: this.getTitle(),
      version: this.getVersion(),
      applicationDomainName: this.getApplicationDomainName()
    };
  }


}
