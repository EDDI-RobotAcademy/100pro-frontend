import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { z } from 'zod'
import { useAuthStore } from './authStore'
import { authorizeWithKakao } from './kakaoAuth'

const schema = z.object({
  email: z.email('올바른 이메일 형식을 입력해주세요.'),
  password: z.string().min(6, '비밀번호는 최소 6자 이상이어야 합니다.'),
})

type LoginFormValues = z.infer<typeof schema>

export function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const collisionState = location.state as {
    collision: boolean
    email: string
    tempToken: string
    message: string
    redirectTo: string
  } | null

  const [searchParams] = useSearchParams()
  const login = useAuthStore((state) => state.login)
  const linkAccount = useAuthStore((state) => state.linkAccount)
  const redirectTo = collisionState?.redirectTo ?? searchParams.get('redirect') ?? '/home'
  const [kakaoError, setKakaoError] = useState('')
  const [loginError, setLoginError] = useState('')
  const kakaoReady = Boolean(import.meta.env.VITE_KAKAO_JS_KEY)

  const [linkPassword, setLinkPassword] = useState('')
  const [linkError, setLinkError] = useState('')

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  })

  const onSubmit = async (data: LoginFormValues) => {
    setLoginError('')
    const result = await login(data.email, data.password)
    if (result.ok) {
      navigate(redirectTo, { replace: true })
    } else {
      setLoginError(result.reason || '로그인에 실패했습니다.')
    }
  }

  const onKakaoLogin = async () => {
    if (!kakaoReady) {
      setKakaoError('현재 Kakao 키가 설정되지 않아 이메일 로그인만 사용할 수 있어요.')
      return
    }
    try {
      setKakaoError('')
      await authorizeWithKakao(redirectTo)
    } catch (error) {
      setKakaoError(error instanceof Error ? error.message : '카카오 로그인 준비 실패')
    }
  }

  const onLinkAccount = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!collisionState) return
    if (!linkPassword) {
      setLinkError('비밀번호를 입력해주세요.')
      return
    }

    setLinkError('')
    const result = await linkAccount(collisionState.tempToken, linkPassword)
    if (result.ok) {
      // Clear state and navigate
      navigate(redirectTo, { replace: true, state: null })
    } else {
      setLinkError(result.reason || '비밀번호 확인에 실패했습니다.')
    }
  }

  if (collisionState) {
    return (
      <section className="screen login-screen">
        <header className="screen-header login-hero">
          <h1>기존 계정 발견!</h1>
          <p>{collisionState.message}</p>
          <p style={{ marginTop: 8, fontSize: '14px', color: '#ff5c5c' }}>연동할 이메일: <strong>{collisionState.email}</strong></p>
        </header>
        <div className="login-panel">
          <form className="login-form" onSubmit={onLinkAccount}>
            <label>
              비밀번호
              <input
                type="password"
                value={linkPassword}
                onChange={(e) => setLinkPassword(e.target.value)}
                autoFocus
              />
              {linkError ? <span className="error-text">{linkError}</span> : null}
            </label>
            <button type="submit" className="login-submit" style={{ marginTop: '16px' }}>
              안전하게 계정 연동하기
            </button>
            <button
              type="button"
              className="link-button"
              style={{ marginTop: '24px', display: 'block', width: '100%', textAlign: 'center' }}
              onClick={() => navigate('/login', { replace: true, state: null })}
            >
              취소하고 돌아가기
            </button>
          </form>
        </div>
      </section>
    )
  }

  return (
    <section className="screen login-screen">
      <header className="screen-header login-hero">
        <div className="login-emoji" role="img" aria-label="브랜드 이모지">
          <svg viewBox="0 0 38 34" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path
              d="M22.1621 33.93C20.8306 33.8834 19.4991 33.8401 18.1676 33.7802C16.8785 33.6782 15.6208 33.3302 14.4627 32.7549C13.6989 32.4297 12.9582 32.0527 12.2457 31.6265C11.5433 31.1838 10.8343 30.7544 10.1353 30.295C9.95752 30.1779 9.77175 30.0733 9.57938 29.9821C8.01901 29.237 6.81225 27.9108 6.21735 26.2872C5.92888 25.5966 5.60556 24.9211 5.24867 24.2633C4.77931 23.3845 4.60955 22.4225 4.37987 21.4738C4.21825 20.5956 4.14245 19.7037 4.15351 18.8108C4.10358 17.6491 3.99706 16.4807 4.00372 15.3256C3.99404 13.2688 4.47323 11.2391 5.4018 9.40373C5.92441 8.38513 6.45034 7.36653 6.99293 6.35792C7.32758 5.75079 7.74181 5.19106 8.22459 4.69354C9.1591 3.73629 10.1798 2.86714 11.2737 2.09711C12.2806 1.41186 13.4263 0.957219 14.6291 0.765612C15.9302 0.563434 17.2438 0.452206 18.5604 0.432737C18.7634 0.423757 18.964 0.385643 19.1562 0.31956C19.5956 0.179539 20.0532 0.105498 20.5143 0.0998611C21.24 0.0765598 21.9657 0.00665751 22.6947 0C24.2808 0.0295473 25.855 0.280519 27.3716 0.74564C27.9475 0.908749 28.5533 0.945366 29.1258 1.10515C29.7633 1.23538 30.3899 1.41456 30.9999 1.64107C31.1368 1.69589 31.2622 1.77608 31.3694 1.87742C31.7256 2.23359 32.2249 2.36009 32.5911 2.71959C33.5288 3.63894 34.2923 4.72048 34.8446 5.91187C35.733 7.81148 36.5164 9.7584 37.1914 11.7438C37.5683 12.8346 37.7683 13.9786 37.7839 15.1325C37.8039 16.201 37.9038 17.2696 37.9271 18.3414C37.9243 19.5309 37.8398 20.7187 37.6741 21.8965C37.601 22.811 37.3888 23.709 37.0449 24.5596C36.3792 26.0575 35.6535 27.4955 34.4352 28.6339C34.0618 28.9919 33.7115 29.3732 33.3866 29.7757C32.7072 30.5201 31.8884 31.124 30.9766 31.5533C29.1725 32.5483 27.2389 33.2877 25.2312 33.7502C24.4126 33.8819 23.5833 33.9354 22.7546 33.91C22.5615 33.91 22.3652 33.91 22.1721 33.91L22.1621 33.93Z"
              fill="#FFD561"
            />
            <path
              d="M25.3144 9.37379C24.6853 9.39043 24.5987 9.27726 24.7319 8.65145C24.895 7.8925 25.1912 7.21676 25.9369 6.86058C27.2684 6.23145 28.7896 6.52771 29.1391 8.23536C29.1891 8.48834 29.2224 8.74466 29.279 8.99764C29.3122 9.15076 29.279 9.23731 29.1159 9.24397C28.8762 9.24397 28.6365 9.24397 28.3968 9.24397C28.2437 9.24397 28.2104 9.13079 28.1838 9.00097C28.1346 8.58786 28.0397 8.18148 27.9009 7.7893C27.7831 7.49781 27.5915 7.24198 27.3449 7.04699C27.1386 6.89054 27.0121 6.93381 26.8223 7.04699C26.0135 7.55629 25.7971 8.32523 25.8237 9.21068C25.8237 9.33717 25.7838 9.35382 25.7006 9.36047C25.6173 9.36713 25.4509 9.37379 25.3144 9.37379Z"
              fill="#292929"
            />
            <path
              d="M20.1149 9.04092H20.0051C19.5057 9.04092 19.559 9.04092 19.5523 8.57823C19.5446 7.95299 19.2925 7.35559 18.85 6.91385C18.8253 6.88093 18.7941 6.85344 18.7583 6.8331C18.7226 6.81276 18.683 6.80001 18.6421 6.79564C18.6012 6.79126 18.5598 6.79537 18.5205 6.80769C18.4813 6.82001 18.445 6.84028 18.4139 6.86725C18.0369 7.12435 17.7257 7.46641 17.5052 7.86587C17.2839 8.18632 17.108 8.53582 16.9825 8.90445C16.9858 8.92092 16.9858 8.9379 16.9825 8.95438C16.9026 9.08087 16.0106 9.10084 15.924 8.98101C15.8841 8.92775 15.924 8.87449 15.924 8.82455C16.2027 8.05578 16.6696 7.36911 17.2821 6.8273C17.5893 6.61665 17.9516 6.5009 18.324 6.49443C18.5504 6.47112 18.7867 6.49443 19.0164 6.49443C19.2297 6.47986 19.443 6.52246 19.6344 6.61784C19.8257 6.71322 19.9881 6.85792 20.1049 7.03701C20.5045 7.55457 20.7053 8.19824 20.6708 8.85118C20.6731 8.87873 20.6692 8.90645 20.6592 8.93225C20.6493 8.95806 20.6337 8.98128 20.6135 9.00017C20.5933 9.01907 20.5691 9.03315 20.5427 9.04136C20.5163 9.04957 20.4884 9.0517 20.4611 9.04758H20.1282L20.1149 9.04092Z"
              fill="#292929"
            />
            <path
              d="M23.2141 14.0573C23.0195 14.1578 22.7984 14.1951 22.5816 14.1639C21.872 14.1939 21.1716 13.9942 20.5844 13.5946C20.4707 13.5319 20.3723 13.4447 20.2963 13.3394C20.2203 13.234 20.1686 13.1132 20.145 12.9855C20.0817 12.5228 20.2182 12.3197 20.6709 12.1866L21.2201 12.0102C21.0884 11.9237 20.9845 11.8011 20.9207 11.657C20.8569 11.513 20.8361 11.3536 20.8606 11.1979C20.8732 11.0181 20.9532 10.8496 21.0847 10.7261C21.2162 10.6027 21.3894 10.5334 21.5697 10.5322C22.338 10.4419 23.1123 10.6426 23.74 11.0948C23.8033 11.1447 23.9098 11.1846 23.8898 11.2745C23.8698 11.3644 23.7467 11.3677 23.6568 11.371H23.6501C23.4238 11.4057 23.1927 11.3903 22.9729 11.3259C22.7532 11.2615 22.5503 11.1496 22.3786 10.9982C22.1123 10.7952 22.0457 10.8518 21.9758 11.1846C21.9487 11.3088 21.9589 11.4383 22.0051 11.5567C22.0513 11.6751 22.1314 11.7773 22.2354 11.8504C22.3087 11.9136 22.4219 11.9769 22.3786 12.0967C22.3353 12.2165 22.2221 12.1733 22.1322 12.1932C21.997 12.2205 21.8636 12.2561 21.7328 12.2998C21.5397 12.363 21.3133 12.3763 21.2634 12.6559C21.2284 12.7962 21.2379 12.9439 21.2903 13.0786C21.3428 13.2134 21.4357 13.3285 21.5563 13.4082C21.9247 13.6912 22.3655 13.8643 22.828 13.9075C22.9708 13.9075 23.1086 13.961 23.2141 14.0573Z"
              fill="#292929"
            />
            <path
              d="M11.164 6.74072C12.0861 6.84058 12.7419 7.47637 13.3677 8.29857C13.9469 9.05753 14.1599 9.96295 14.4362 10.8584C14.7644 12.0358 14.8861 13.2611 14.7957 14.4801C14.7241 15.6129 14.463 16.7257 14.0234 17.7722C13.8927 18.1445 13.7313 18.5052 13.5408 18.8507C13.1247 19.5631 12.9549 20.372 12.6254 21.1176C12.5555 21.284 12.4789 21.4505 12.4223 21.6269C12.3926 21.7243 12.3385 21.8124 12.2651 21.8829C12.1916 21.9534 12.1014 22.004 12.0029 22.0297C11.7065 22.1093 11.401 22.1496 11.0941 22.1495C10.3824 22.1676 9.67773 22.0038 9.04695 21.6735C8.27468 21.2641 7.4558 20.9512 6.67354 20.5617C5.7011 20.0564 4.79067 19.4398 3.9606 18.7242C2.68112 17.6696 1.61461 16.3805 0.818255 14.9261C0.236544 13.9443 -0.0457525 12.814 0.00603763 11.6739C0.0420349 11.3449 0.146181 11.027 0.31181 10.7404C0.477439 10.4539 0.700925 10.205 0.968053 10.0096C1.64249 9.45985 2.47565 9.14129 3.34479 9.1008C3.76713 9.06801 4.19172 9.12197 4.59244 9.25936C4.99316 9.39675 5.36154 9.61467 5.67492 9.8997C6.15894 10.31 6.60461 10.7634 7.00642 11.2545C7.12103 10.9483 7.20031 10.63 7.24275 10.3058C7.35944 9.63232 7.57718 8.9803 7.88855 8.3718C8.42448 7.35321 9.3632 6.93711 10.4384 6.75403C10.6785 6.71594 10.9227 6.71146 11.164 6.74072Z"
              fill="#FF919B"
            />
          </svg>
        </div>
        <h1>
          사용하시려면
          <br />
          로그인 하세요
        </h1>
        <p>3초만에 빠른 회원가입! SNS 계정으로 로그인 하기</p>
      </header>

      <div className="login-panel">
        <button
          type="button"
          className="kakao-button"
          onClick={onKakaoLogin}
          disabled={!kakaoReady}
        >
          카카오 아이디로 로그인
        </button>
        {kakaoError ? (
          <p className="error-text" role="alert" aria-live="polite">
            {kakaoError}
          </p>
        ) : null}

        <div className="login-divider" aria-hidden="true">
          <span />
          <em>Or login with</em>
          <span />
        </div>

        <form className="login-form" onSubmit={handleSubmit(onSubmit)}>
          <label>
            Email
            <input id="email" type="email" {...register('email')} />
            {errors.email ? <span className="error-text">{errors.email.message}</span> : null}
          </label>
          <label>
            Password
            <input id="password" type="password" {...register('password')} />
            {errors.password ? (
              <span className="error-text">{errors.password.message}</span>
            ) : null}
            {loginError ? <span className="error-text">{loginError}</span> : null}
          </label>
          <div className="login-meta-row">
            <label className="login-keep">
              <input type="checkbox" />
              <span className="login-keep-label">로그인 상태 유지</span>
            </label>
            <button type="button" className="link-button login-forgot">
              비밀번호를 잊었나요?
            </button>
          </div>
          <button type="submit" className="login-submit">
            Log In
          </button>
          <div className="login-signup-row">
            <span>아직 회원이 아니세요?</span>
            <button type="button" className="link-button login-signup-button" onClick={() => navigate('/signup')}>
              회원가입
            </button>
          </div>
        </form>
      </div>
    </section>
  )
}
