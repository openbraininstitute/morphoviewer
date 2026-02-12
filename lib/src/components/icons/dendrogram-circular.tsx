export function IconDendrogramCircular() {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
            <title>circular</title>
            <g
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
            >
                <path d="M8,12A4,4 0,1, 1 12,16M8,12h-4M16,12h4M12,16v4" />
                <path
                    transform="rotate(30 12 12)"
                    d="M12,4 A8,8 0,0,1 20,12M20,12h3M12,4v-3"
                />
                <path
                    transform="rotate(250 12 12)"
                    d="M12,4 A8,8 0,0,1 20,12M20,12h3M12,4v-3M18,6l2,-2"
                />
            </g>
        </svg>
    );
}
