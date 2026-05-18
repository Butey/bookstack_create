import axios, { Method } from 'axios';
import https from 'https';

export class BookStackService {
  private httpsAgent = new https.Agent({ rejectUnauthorized: false });

  public async proxyRequest(baseUrl: string, tokenId: string, tokenSecret: string, method: Method | string, url: string, data?: any): Promise<{ status: number, data: any }> {
    const response = await axios({
      method,
      url: `${baseUrl.replace(/\/$/, '')}${url}`,
      headers: {
        'Authorization': `Token ${tokenId}:${tokenSecret}`,
        'Accept': 'application/json',
        ...(method.toUpperCase() !== 'GET' && method.toUpperCase() !== 'HEAD' && { 'Content-Type': 'application/json' })
      },
      httpsAgent: this.httpsAgent,
      ...(data && { data })
    });
    
    return { status: response.status, data: response.data };
  }
}
