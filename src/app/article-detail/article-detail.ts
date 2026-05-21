import { ChangeDetectorRef, Component } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { marked } from 'marked';
import type { Tokens } from 'marked';
import DOMPurify from 'dompurify';

type RenderResult = {
  html: string;
  violations: string[];
  title: string | null;
};

@Component({
  selector: 'app-article-detail',
  imports: [RouterLink],
  templateUrl: './article-detail.html',
  styleUrl: './article-detail.scss'
})
export class ArticleDetail {
  title = '';
  html: SafeHtml = '';
  violations: string[] = [];
  isLoading = true;
  error = '';

  private readonly slugPattern = /^[a-z0-9-]+$/i;

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly sanitizer: DomSanitizer,
    private readonly cdr: ChangeDetectorRef
  ) {
    this.route.paramMap.subscribe((params) => {
      const slug = params.get('slug') ?? '';
      void this.loadArticle(slug);
    });
  }

  async loadArticle(slug: string) {
    this.isLoading = true;
    this.error = '';
    this.violations = [];
    this.title = '';
    this.html = '';

    if (!this.slugPattern.test(slug)) {
      this.error = '文章不存在或路徑格式錯誤。';
      this.isLoading = false;
      return;
    }

    try {
      const response = await fetch(`/articles/${slug}/index.md`, { cache: 'no-store' });
      if (!response.ok) {
        throw new Error('index.md not found');
      }

      const rawMarkdown = await response.text();
      const rendered = this.renderMarkdown(rawMarkdown, slug);
      const sanitized = DOMPurify.sanitize(rendered.html, {
        USE_PROFILES: { html: true },
        ADD_ATTR: ['target', 'rel']
      });

      this.title = rendered.title ?? '文章';
      this.violations = rendered.violations;
      this.html = this.sanitizer.bypassSecurityTrustHtml(sanitized);
    } catch (error) {
      console.error(error);
      this.error = '文章讀取失敗，請確認檔案是否存在。';
    } finally {
      this.isLoading = false;
      this.cdr.detectChanges();
    }
  }

  onContentClick(event: MouseEvent) {
    const target = event.target as HTMLElement | null;
    if (!target) {
      return;
    }
    const link = target.closest('a') as HTMLAnchorElement | null;
    if (!link) {
      return;
    }
    const href = link.getAttribute('href') ?? '';
    if (href.startsWith('/articles/')) {
      event.preventDefault();
      this.router.navigateByUrl(href);
    }
  }

  private renderMarkdown(markdown: string, slug: string): RenderResult {
    const violations: string[] = [];
    const title = this.extractTitle(markdown);
    const prepared = markdown.replace(/\[\[([\w-]+)\]\]/g, (_match, slugRef) => {
      return `[${slugRef}](article:${slugRef})`;
    });

    const renderer = new marked.Renderer();
    const baseLink = renderer.link.bind(renderer);
    const baseImage = renderer.image.bind(renderer);

    renderer.link = (link: Tokens.Link) => {
      const href = link.href ?? '';
      const text = link.text ?? '';
      if (!href) {
        return text;
      }
      const normalized = href.trim();
      if (normalized.startsWith('#')) {
        return baseLink(link);
      }

      if (normalized.startsWith('article:')) {
        const articleTarget = normalized.replace('article:', '').trim();
        const articleHref = this.resolveArticleHref(articleTarget, violations);
        return articleHref ? baseLink({ ...link, href: articleHref }) : text;
      }

      if (this.isExternalLink(normalized)) {
        return baseLink(link);
      }

      const sameFolderPath = this.normalizeSameFolderPath(normalized);
      if (sameFolderPath) {
        return baseLink({ ...link, href: `/articles/${slug}/${sameFolderPath}` });
      }

      violations.push(`不允許的連結：${normalized}`);
      return text;
    };

    renderer.image = (image: Tokens.Image) => {
      const href = image.href ?? '';
      if (!href) {
        return '';
      }
      const normalized = href.trim();
      const sameFolderPath = this.normalizeSameFolderPath(normalized);
      if (!sameFolderPath) {
        violations.push(`不允許的圖片路徑：${normalized}`);
        return '';
      }
      return baseImage({ ...image, href: `/articles/${slug}/${sameFolderPath}` });
    };

    const html = marked.parse(prepared, {
      renderer,
      gfm: true,
      breaks: true
    }) as string;

    return { html, violations, title };
  }

  private extractTitle(markdown: string): string | null {
    const match = markdown.match(/^#\s+(.+)$/m);
    return match ? match[1].trim() : null;
  }

  private resolveArticleHref(target: string, violations: string[]): string | null {
    const [slugPart, hashPart] = target.split('#');
    if (!this.slugPattern.test(slugPart)) {
      violations.push(`不允許的文章引用：${target}`);
      return null;
    }
    const hashSuffix = hashPart ? `#${hashPart}` : '';
    return `/articles/${slugPart}${hashSuffix}`;
  }

  private isExternalLink(href: string): boolean {
    return /^(https?:|mailto:)/i.test(href);
  }

  private normalizeSameFolderPath(href: string): string | null {
    if (/^[a-z][a-z0-9+.-]*:/i.test(href)) {
      return null;
    }
    if (href.startsWith('#')) {
      return null;
    }

    const [pathPart, suffix] = href.split(/(?=[?#])/);
    let path = pathPart;
    if (path.startsWith('./')) {
      path = path.slice(2);
    }
    if (!path) {
      return null;
    }
    if (path.includes('..') || path.includes('/') || path.includes('\\')) {
      return null;
    }

    return `${path}${suffix ?? ''}`;
  }
}
