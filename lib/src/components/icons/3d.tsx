import { CSSProperties } from "react";

type Props = {
    className?: string;
    style?: CSSProperties;
};

export function Icon3D({ className, style }: Props) {
    return (
        <svg
            className={className}
            style={{
                width: "1.5em",
                height: "1.5em",
                ...style,
            }}
            viewBox="0 0 24 24"
            fill="currentColor"
            xmlns="http://www.w3.org/2000/svg"
        >
            <title>3D</title>
            <path d="M5,7H9A2,2 0 0,1 11,9V15A2,2 0 0,1 9,17H5V15H9V13H6V11H9V9H5V7M13,7H16A3,3 0 0,1 19,10V14A3,3 0 0,1 16,17H13V7M16,15A1,1 0 0,0 17,14V10A1,1 0 0,0 16,9H15V15H16Z" />
        </svg>
    );
}
