
export function hugoDate(timestamp) {
    let date = new Date(timestamp);

    //if date.getdate does not have a zero, add A ZERO BEFORE IT
    let month;
    if (date.getMonth() + 1 < 10) {
        month = `0${date.getMonth() + 1}`;
    } else {
        month = `${date.getMonth() + 1}`;
    }
    let day;
    if (date.getDate() < 10) {
        day = `0${date.getDate()}`;
    } else {
        day = `${date.getDate()}`;
    }

    return `${date.getFullYear()}-${month}-${day}`;
}
