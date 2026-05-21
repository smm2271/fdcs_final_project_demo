import { Component } from '@angular/core';
import { NgFor, NgIf } from '@angular/common';
import { RouterLink } from '@angular/router';

type ArticleIndexItem = {
  slug: string;
  title: string;
  summary?: string;
  date?: string;
};

@Component({
  selector: 'app-articles',
  imports: [NgIf, NgFor, RouterLink],
  templateUrl: './articles.html',
  styleUrl: './articles.scss'
})
export class Articles {
  items: ArticleIndexItem[] = [];
  isLoading = true;
  error = '';

  async ngOnInit() {
    await this.loadIndex();
  }

  private async loadIndex() {
    try {
      const response = await fetch('/articles/index.json', { cache: 'no-store' });
      if (!response.ok) {
        throw new Error('index.json not found');
      }
      const data = (await response.json()) as ArticleIndexItem[];
      if (!Array.isArray(data)) {
        throw new Error('index.json format error');
      }

      this.items = data
        .filter((item) => item && typeof item.slug === 'string' && typeof item.title === 'string')
        .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
    } catch (error) {
      console.error(error);
      this.error = '文章列表讀取失敗，請稍後再試。';
    } finally {
      this.isLoading = false;
    }
  }
}
